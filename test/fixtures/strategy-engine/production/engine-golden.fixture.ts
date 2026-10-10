// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import {
  createEngine,
  EngineDecimal,
  formatEngineDecimal,
  toEngineDecimal,
  type EngineDecimalValue,
  type EngineState,
  type StepResult,
} from '../../../../packages/strategy-engine/src/index.js';
import { runSteps } from '../engine-contract-runs.fixture.js';
import type { EngineScenario, RecordedStep } from '../engine-contract-types.fixture.js';
import { buildReferenceRun } from '../engine-scenarios.fixture.js';
import { buyDebit, liquidationValue } from '../reference-pricing.fixture.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
  type RealDataset,
} from '../signal/classic-signals.fixture.js';

const RATIO_PLACES = 8;
const ZERO = new EngineDecimal(0);

// O Placar clássico + os parâmetros de exemplo (saldo 10 000, taxa 0,1%, slippage 0,05%) sobre um conjunto
// REAL inteiro, pelo motor completo de produção, do estado inicial.
export function buildClassicScenario(dataset: RealDataset): EngineScenario {
  return {
    name: dataset.name,
    strategy: CLASSIC_STRATEGY,
    run: buildReferenceRun({ symbol: dataset.market.symbol, timeframe: dataset.market.timeframe }),
    candles: dataset.candles,
    sentiment: [],
    commands: {},
    requiredEvents: [],
  };
}

export function runClassicEngine(dataset: RealDataset): RecordedStep[] {
  return runSteps({ engine: createEngine(), scenario: buildClassicScenario(dataset) });
}

export type EngineGoldenSummary = {
  readonly candles: number;
  readonly decided: number;
  readonly operations: number;
  readonly wins: number;
  readonly feesPaid: string;
  readonly finalEquity: string;
  readonly maxDrawdownAtClose: string;
  readonly maxDrawdownAtLow: string;
  readonly buyAndHoldReturn: string;
  readonly digest: string;
};

function ratio(numerator: EngineDecimalValue, denominator: EngineDecimalValue): string {
  const value = numerator
    .dividedBy(denominator)
    .toDecimalPlaces(RATIO_PLACES, EngineDecimal.ROUND_HALF_UP);
  return formatEngineDecimal(value);
}

type Drawdowns = { readonly atClose: EngineDecimalValue; readonly atLow: EngineDecimalValue };

// Queda máxima desde o pico de patrimônio (fechamento), medida no fechamento e na mínima do candle.
function measureDrawdowns(run: readonly RecordedStep[], initialBalance: string): Drawdowns {
  let peak = toEngineDecimal(initialBalance);
  let atClose = ZERO;
  let atLow = ZERO;
  for (const step of run) {
    const point = step.result.decisions.equityPoint;
    if (point === null) continue;
    const equity = toEngineDecimal(point.equity);
    if (equity.greaterThan(peak)) peak = equity;
    atClose = EngineDecimal.max(atClose, peak.minus(equity).dividedBy(peak));
    atLow = EngineDecimal.max(
      atLow,
      peak.minus(toEngineDecimal(point.equityAtLow)).dividedBy(peak),
    );
  }
  return { atClose, atLow };
}

function lastEquityPoint(run: readonly RecordedStep[]): { equity: string; benchmark: string } {
  for (const step of [...run].reverse()) {
    const point = step.result.decisions.equityPoint;
    if (point !== null) return { equity: point.equity, benchmark: point.benchmark };
  }
  throw new Error('Execução sem ponto de patrimônio.');
}

function decisionsOf(run: readonly RecordedStep[]): StepResult['decisions'][] {
  return run.map((step) => step.result.decisions);
}

export function summarizeEngineRun(
  run: readonly RecordedStep[],
  initialBalance: string,
): EngineGoldenSummary {
  const decisions = decisionsOf(run);
  const closed = decisions.flatMap((decision) => decision.closedPositions);
  const fees = decisions
    .flatMap((decision) => decision.fills)
    .reduce((sum, fill) => sum.plus(fill.fee), ZERO);
  const last = lastEquityPoint(run);
  const initial = toEngineDecimal(initialBalance);
  const drawdowns = measureDrawdowns(run, initialBalance);
  return {
    candles: run.length,
    decided: decisions.filter((decision) => decision.signal !== null).length,
    operations: closed.length,
    wins: closed.filter((position) => toEngineDecimal(position.netProfit).greaterThan(0)).length,
    feesPaid: formatEngineDecimal(fees),
    finalEquity: last.equity,
    maxDrawdownAtClose: formatEngineDecimal(drawdowns.atClose.toDecimalPlaces(RATIO_PLACES)),
    maxDrawdownAtLow: formatEngineDecimal(drawdowns.atLow.toDecimalPlaces(RATIO_PLACES)),
    buyAndHoldReturn: ratio(toEngineDecimal(last.benchmark).minus(initial), initial),
    digest: createHash('sha256').update(JSON.stringify(decisions)).digest('hex'),
  };
}

export type Reconciliation = {
  readonly realized: string;
  readonly unrealized: string;
  readonly variation: string;
  readonly cashReplayed: string;
};

// A contabilidade fecha por conta independente: soma dos resultados das operações + o que a posição ainda
// aberta vale a mais ou a menos que o custo dela = patrimônio final − saldo inicial; e reproduzir os
// preenchimentos um a um sobre o saldo inicial dá o caixa final do estado.
export function reconcileRun(
  scenario: EngineScenario,
  run: readonly RecordedStep[],
): Reconciliation {
  const parameters = scenario.run.parameters;
  const decisions = decisionsOf(run);
  const realized = decisions
    .flatMap((decision) => decision.closedPositions)
    .reduce((sum, position) => sum.plus(position.netProfit), ZERO);
  const finalState: EngineState | undefined = run.at(-1)?.result.state;
  if (finalState === undefined) throw new Error('Execução vazia.');
  const last = run.at(-1);
  const position = finalState.wallet.position;
  const unrealized =
    position === null || last === undefined
      ? ZERO
      : liquidationValue({
          quantity: toEngineDecimal(position.quantity),
          price: last.candle.close,
          run: parameters,
        }).minus(
          buyDebit(toEngineDecimal(position.quantity).times(position.entryPrice), parameters),
        );
  let cash = toEngineDecimal(parameters.initialBalance);
  for (const fill of decisions.flatMap((decision) => decision.fills)) {
    const notional = toEngineDecimal(fill.notional);
    cash =
      fill.side === 'buy'
        ? cash.minus(buyDebit(notional, parameters))
        : cash.plus(notional.toDecimalPlaces(8, EngineDecimal.ROUND_FLOOR).minus(fill.fee));
  }
  return {
    realized: formatEngineDecimal(realized),
    unrealized: formatEngineDecimal(unrealized),
    variation: formatEngineDecimal(
      toEngineDecimal(lastEquityPoint(run).equity).minus(parameters.initialBalance),
    ),
    cashReplayed: formatEngineDecimal(cash),
  };
}

export const GOLDEN_DATASETS: readonly RealDataset[] = REAL_DATASETS;
