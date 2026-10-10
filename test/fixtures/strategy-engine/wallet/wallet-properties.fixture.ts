// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatEngineDecimal,
  toEngineDecimal,
  type FillDecision,
  type OrderEvent,
} from '../../../../packages/strategy-engine/src/index.js';
import { liquidationValue, tickUp } from '../reference-pricing.fixture.js';
import {
  iterateFlows,
  runWalletFlow,
  type RecordedWalletStep,
  type WalletImplementation,
} from './wallet-differential.fixture.js';

type FlowMemory = {
  readonly createdIndex: Map<string, number>;
  readonly created: Map<string, OrderEvent>;
  readonly orderOfPosition: Map<string, string>;
  readonly alive: Set<string>;
};

function remember(memory: FlowMemory, recorded: RecordedWalletStep): void {
  const { decisions } = recorded.result;
  for (const order of decisions.orders) {
    if (order.status !== 'created') continue;
    memory.createdIndex.set(order.orderKey, recorded.index);
    memory.created.set(order.orderKey, order);
  }
  for (const fill of decisions.fills) {
    if (fill.side === 'buy') memory.orderOfPosition.set(fill.positionKey, fill.orderKey);
  }
}

function checkCashAndPosition(
  memory: FlowMemory,
  recorded: RecordedWalletStep,
): string | undefined {
  const { state, decisions } = recorded.result;
  if (toEngineDecimal(state.cash).lessThan(0)) return 'caixa negativo';
  for (const opened of decisions.openedPositions) memory.alive.add(opened.positionKey);
  for (const closed of decisions.closedPositions) memory.alive.delete(closed.positionKey);
  if (memory.alive.size > 1) return 'mais de uma posição aberta';
  if (memory.alive.size !== (state.position === null ? 0 : 1)) return 'posição e decisões divergem';
  return undefined;
}

// Patrimônio = caixa + posição a valor de liquidação, no fechamento e na mínima (conta independente).
function checkEquity(recorded: RecordedWalletStep): string | undefined {
  const point = recorded.result.decisions.equityPoint;
  if (point === null)
    return recorded.step.signal === null ? undefined : 'sinal sem ponto de patrimônio';
  const { state } = recorded.result;
  const { candle } = recorded.step;
  const parameters = recorded.flow.run.parameters;
  const quantity = toEngineDecimal(state.position?.quantity ?? '0');
  const cash = toEngineDecimal(state.cash);
  const atClose = cash.plus(liquidationValue({ quantity, price: candle.close, run: parameters }));
  const atLow = cash.plus(liquidationValue({ quantity, price: candle.low, run: parameters }));
  if (point.equity !== formatEngineDecimal(atClose)) return 'patrimônio no fechamento errado';
  if (point.equityAtLow !== formatEngineDecimal(atLow)) return 'patrimônio na mínima errado';
  return undefined;
}

// Perda realizada num stop SEM gap nunca passa do valor em risco da ordem (taxas e slippage inclusos).
// Abertura no stop ou abaixo dele é gap, também no candle de entrada (limitada preenchida a L com a
// abertura já abaixo do stop sai na abertura, pior que o stop).
function checkStopLoss(memory: FlowMemory, recorded: RecordedWalletStep): string | undefined {
  const { candle } = recorded.step;
  const { decisions } = recorded.result;
  for (const closed of decisions.closedPositions) {
    if (closed.exitReason !== 'stop') continue;
    const position = [recorded.before.position, ...decisions.openedPositions].find(
      (candidate) => candidate?.positionKey === closed.positionKey,
    );
    const isGap =
      position === undefined ||
      position === null ||
      toEngineDecimal(candle.open).lte(position.stopPrice);
    const orderKey = memory.orderOfPosition.get(closed.positionKey) ?? '';
    const risk = memory.created.get(orderKey)?.riskAmount ?? null;
    if (isGap || risk === null) continue;
    if (toEngineDecimal(closed.netProfit).negated().greaterThan(risk)) {
      return `perda de ${closed.netProfit} num stop sem gap acima do risco ${risk}`;
    }
  }
  return undefined;
}

function isMarketExit(order: OrderEvent | undefined): boolean {
  return order?.purpose === 'exit' && order.type === 'market';
}

function checkFillTiming(
  memory: FlowMemory,
  recorded: RecordedWalletStep,
  fill: FillDecision,
): string | undefined {
  const order = memory.created.get(fill.orderKey);
  const createdIndex = memory.createdIndex.get(fill.orderKey);
  if (order === undefined || createdIndex === undefined) return 'preenchimento sem ordem criada';
  const age = recorded.index - createdIndex;
  if (order.type === 'stop' || order.type === 'target') {
    return age === 0 ? undefined : 'saída protetora nasceu num candle e preencheu em outro';
  }
  if (age < 1) return 'ordem preenchida no candle em que foi decidida';
  if (order.type === 'market' && age !== 1) return 'ordem a mercado preenchida depois de t+1';
  if (isMarketExit(order) && age !== 1) return 'venda a mercado preenchida depois de t+1';
  if (order.type === 'limit' && age > (order.eligibleCandles ?? 0)) {
    return 'limitada preenchida depois da validade';
  }
  return undefined;
}

function checkFillPrice(
  memory: FlowMemory,
  recorded: RecordedWalletStep,
  fill: FillDecision,
): string | undefined {
  if (memory.created.get(fill.orderKey)?.type === 'target') {
    // Gap acima do alvo preenche ao PREÇO DO ALVO, mesmo abaixo do candle (ordem que já estava no livro).
    const opened = recorded.result.decisions.openedPositions;
    const target = [recorded.before.position, ...opened].find(
      (position) => position?.positionKey === fill.positionKey,
    )?.targetPrice;
    return fill.price === target ? undefined : 'saída no alvo fora do preço do alvo';
  }
  const order = memory.created.get(fill.orderKey);
  if (order?.type === 'limit' && order.limitPrice !== null) {
    // Limitada preenche a `min(L, …)` ou a `L`: nunca acima do limite, mesmo com o candle todo abaixo dele.
    return toEngineDecimal(fill.price).lte(order.limitPrice)
      ? undefined
      : 'limitada acima do limite';
  }
  const { candle } = recorded.step;
  const parameters = recorded.flow.run.parameters;
  const slippage = toEngineDecimal(parameters.slippageRate);
  const price = toEngineDecimal(fill.price);
  const tick = toEngineDecimal(parameters.tickSize);
  const ceiling = tickUp(toEngineDecimal(candle.high).times(slippage.plus(1)), parameters);
  const floor = toEngineDecimal(candle.low).times(slippage.negated().plus(1)).minus(tick);
  if (price.greaterThan(ceiling) || price.lessThan(floor)) return 'preço fora do candle permitido';
  return undefined;
}

function checkFills(memory: FlowMemory, recorded: RecordedWalletStep): string | undefined {
  for (const fill of recorded.result.decisions.fills) {
    const violation =
      checkFillTiming(memory, recorded, fill) ?? checkFillPrice(memory, recorded, fill);
    if (violation !== undefined) return violation;
  }
  return undefined;
}

// As propriedades que valem em TODA execução, sem consultar a referência.
export function findFlowViolation(recorded: readonly RecordedWalletStep[]): string | undefined {
  const memory: FlowMemory = {
    createdIndex: new Map(),
    created: new Map(),
    orderOfPosition: new Map(),
    alive: new Set(),
  };
  for (const step of recorded) {
    remember(memory, step);
    const violation =
      checkCashAndPosition(memory, step) ??
      checkEquity(step) ??
      checkStopLoss(memory, step) ??
      checkFills(memory, step);
    if (violation !== undefined)
      return `fluxo ${step.flow.index}, passo ${step.index}: ${violation}`;
  }
  return undefined;
}

export function findFirstViolation(implementation: WalletImplementation): string | undefined {
  for (const flow of iterateFlows()) {
    const violation = findFlowViolation(runWalletFlow(flow, implementation));
    if (violation !== undefined) return violation;
  }
  return undefined;
}
