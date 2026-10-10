// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  buyDebit,
  floorToIncrement,
  formatFixed,
  formatScaled,
  parseScaled,
  SCALE,
  sellCredit,
  tradeFee,
} from './oracle-scaled.fixture.js';

export type OracleParameters = {
  readonly initialBalance: string;
  readonly feeRate: string;
  readonly slippageRate: string;
  readonly tickSize: string;
};

export type OracleFill = {
  readonly positionKey: string;
  readonly side: string;
  readonly price: string;
  readonly quantity: string;
  readonly notional: string;
  readonly fee: string;
};

export type OracleClosed = {
  readonly positionKey: string;
  readonly exitReason: string;
  readonly entryFee: string;
  readonly exitFee: string;
  readonly netProfit: string;
};

// O que o motor emitiu em um passo: preenchimentos, posições fechadas, caixa e ponto de patrimônio.
export type OracleStep = {
  readonly close: string;
  readonly low: string;
  readonly fills: readonly OracleFill[];
  readonly closed: readonly OracleClosed[];
  readonly reportedCash: string;
  readonly point: { readonly equity: string; readonly equityAtLow: string } | null;
};

type Held = { readonly quantity: bigint; readonly cash: bigint };

function liquidation(params: {
  readonly quantity: bigint;
  readonly price: string;
  readonly rates: { readonly fee: bigint; readonly slippage: bigint; readonly tick: bigint };
}): bigint {
  const { quantity, rates } = params;
  if (quantity === 0n) return 0n;
  const slipped = parseScaled(params.price) * (SCALE - rates.slippage);
  const exitPrice = floorToIncrement(slipped / SCALE, rates.tick);
  return sellCredit(quantity * exitPrice, rates.fee);
}

// Repete a contabilidade passo a passo só com os preenchimentos do motor e as regras do ADR 0002 §e:
// caixa, lucro líquido de cada operação e patrimônio no fechamento e no vale. Devolve o primeiro desvio.
export function findOracleDeviation(
  parameters: OracleParameters,
  steps: readonly OracleStep[],
): string | undefined {
  const rates = {
    fee: parseScaled(parameters.feeRate),
    slippage: parseScaled(parameters.slippageRate),
    tick: parseScaled(parameters.tickSize),
  };
  let cash = parseScaled(parameters.initialBalance);
  const entryCosts = new Map<string, bigint>();
  const entryFees = new Map<string, bigint>();
  const quantities = new Map<string, bigint>();
  for (const [index, step] of steps.entries()) {
    let heldThroughTarget: Held | undefined;
    const exitReasons = new Map(
      step.closed.map((closed) => [closed.positionKey, closed.exitReason]),
    );
    for (const fill of step.fills) {
      const price = parseScaled(fill.price);
      const quantity = parseScaled(fill.quantity);
      const notional = price * quantity;
      const label = `passo ${index}, ${fill.positionKey}`;
      if (fill.notional !== formatFixed(notional, 16)) return `${label}: notional ${fill.notional}`;
      if (fill.fee !== formatScaled(tradeFee(notional, rates.fee)))
        return `${label}: taxa ${fill.fee}`;
      if (fill.side === 'buy') {
        entryCosts.set(fill.positionKey, buyDebit(notional, rates.fee));
        entryFees.set(fill.positionKey, tradeFee(notional, rates.fee));
        quantities.set(fill.positionKey, quantity);
        cash -= buyDebit(notional, rates.fee);
        continue;
      }
      if (exitReasons.get(fill.positionKey) === 'target') heldThroughTarget = { quantity, cash };
      cash += sellCredit(notional, rates.fee);
      quantities.delete(fill.positionKey);
      const closed = step.closed.find((candidate) => candidate.positionKey === fill.positionKey);
      const expectedNet =
        sellCredit(notional, rates.fee) - (entryCosts.get(fill.positionKey) ?? 0n);
      if (closed?.netProfit !== formatScaled(expectedNet))
        return `${label}: lucro ${closed?.netProfit}`;
      if (closed.exitFee !== fill.fee) return `${label}: taxa de saída ${closed.exitFee}`;
      if (closed.entryFee !== formatScaled(entryFees.get(fill.positionKey) ?? 0n)) {
        return `${label}: taxa de entrada ${closed.entryFee}`;
      }
    }
    if (step.reportedCash !== formatScaled(cash))
      return `passo ${index}: caixa ${step.reportedCash}`;
    if (step.point === null) continue;
    const open = [...quantities.values()].reduce((sum, quantity) => sum + quantity, 0n);
    const atClose = cash + liquidation({ quantity: open, price: step.close, rates });
    const held = open > 0n ? { quantity: open, cash } : heldThroughTarget;
    const atLow =
      held === undefined
        ? atClose
        : held.cash + liquidation({ quantity: held.quantity, price: step.low, rates });
    const valley = atLow < atClose ? atLow : atClose;
    if (step.point.equity !== formatScaled(atClose))
      return `passo ${index}: patrimônio ${step.point.equity}`;
    if (step.point.equityAtLow !== formatScaled(valley))
      return `passo ${index}: vale ${step.point.equityAtLow}`;
  }
  return undefined;
}
