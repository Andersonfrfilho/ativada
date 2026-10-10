// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  formatEngineDecimal,
  toEngineDecimal,
  type Engine,
  type EngineCandle,
  type EngineState,
  type StepDecisions,
  type StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';
import type { EngineRun, RecordedStep } from './engine-contract-types.fixture.js';

export type RunStepsParams = {
  readonly engine: Engine;
  readonly strategy: StrategyVersion;
  readonly candles: readonly EngineCandle[];
  readonly initialState?: EngineState;
  readonly shouldFreezeInputs?: boolean;
};

export function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const member of Object.values(value)) deepFreeze(member);
  return Object.freeze(value);
}

export function runSteps(params: RunStepsParams): RecordedStep[] {
  const { engine, strategy } = params;
  let state = params.initialState ?? engine.createInitialState(strategy);
  const steps: RecordedStep[] = [];
  for (const candle of params.candles) {
    const input = { strategy, state, candle };
    const result = engine.step(params.shouldFreezeInputs === true ? deepFreeze(input) : input);
    steps.push({ candle, result });
    state = result.state;
  }
  return steps;
}

// Relógio e aleatoriedade trocados: motor puro não percebe; motor que lê o relógio diverge.
export function withPerturbedEnvironment<TValue>(run: () => TValue): TValue {
  const originalDateNow = Date.now;
  const originalRandom = Math.random;
  const originalPerformanceNow = performance.now.bind(performance);
  Date.now = (): number => originalDateNow() + 400 * 24 * 60 * 60 * 1_000;
  Math.random = (): number => 0.123456789;
  performance.now = (): number => originalPerformanceNow() + 987_654.321;
  try {
    return run();
  } finally {
    Date.now = originalDateNow;
    Math.random = originalRandom;
    performance.now = originalPerformanceNow;
  }
}

export function serializeRun(run: EngineRun): string {
  return JSON.stringify(run.map((step) => step.result));
}

const FUTURE_PRICE_FACTOR = '1.37';

function scalePrice(price: string): string {
  return formatEngineDecimal(toEngineDecimal(price).times(FUTURE_PRICE_FACTOR));
}

// Futuro adulterado e ainda válido (máxima e mínima continuam envolvendo abertura e fechamento).
export function mutateCandlesAfter(
  candles: readonly EngineCandle[],
  cutIndex: number,
): EngineCandle[] {
  return candles.map((candle, index) =>
    index <= cutIndex
      ? candle
      : {
          ...candle,
          open: scalePrice(candle.open),
          high: scalePrice(candle.high),
          low: scalePrice(candle.low),
          close: scalePrice(candle.close),
          volume: formatEngineDecimal(new EngineDecimal(candle.volume).plus(1)),
        },
  );
}

type StampedDecision = { readonly kind: string; readonly time: number; readonly value: unknown };

function stampDecisions(decisions: StepDecisions): StampedDecision[] {
  const stamped: StampedDecision[] = [];
  if (decisions.signal !== null) {
    stamped.push({
      kind: 'signal',
      time: decisions.signal.candleOpenTime,
      value: decisions.signal,
    });
  }
  if (decisions.equityPoint !== null) {
    const point = decisions.equityPoint;
    stamped.push({ kind: 'equity', time: point.candleOpenTime, value: point });
  }
  const lists = [
    ['order', decisions.orders],
    ['fill', decisions.fills],
    ['opened', decisions.openedPositions],
    ['closed', decisions.closedPositions],
  ] as const;
  for (const [kind, items] of lists) {
    for (const item of items) stamped.push({ kind, time: item.candleOpenTime, value: item });
  }
  return stamped;
}

// Tudo o que a execução afirma sobre o instante `time` ou antes dele, venha de que passo vier.
export function decisionsStampedUpTo(run: EngineRun, time: number): string {
  const stamped = run.flatMap((step) => stampDecisions(step.result.decisions));
  return JSON.stringify(stamped.filter((decision) => decision.time <= time));
}
