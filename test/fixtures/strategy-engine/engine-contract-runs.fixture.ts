// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  EngineDecimal,
  formatEngineDecimal,
  selectAvailableSentiment,
  SENTIMENT_STALE_AFTER_MILLISECONDS,
  toEngineDecimal,
  type Engine,
  type EngineCandle,
  type EngineState,
  type RunParameters,
  type SentimentObservation,
  type StepDecisions,
  type StepInput,
} from '../../../packages/strategy-engine/src/index.js';
import type {
  EngineRun,
  EngineScenario,
  RecordedStep,
  ScenarioCommands,
} from './engine-contract-types.fixture.js';

export type RunStepsParams = {
  readonly engine: Engine;
  readonly scenario: EngineScenario;
  readonly candles?: readonly EngineCandle[];
  readonly sentiment?: readonly SentimentObservation[];
  readonly initialState?: EngineState;
  readonly shouldFreezeInputs?: boolean;
};

export function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const member of Object.values(value)) deepFreeze(member);
  return Object.freeze(value);
}

// O que o chamador real faz por candle: sentimento disponível no fechamento e comandos daquele candle.
export function buildStepInput(params: {
  readonly scenario: EngineScenario;
  readonly state: EngineState;
  readonly candle: EngineCandle;
  readonly sentiment: readonly SentimentObservation[];
}): StepInput {
  const { scenario, candle } = params;
  return {
    strategy: scenario.strategy,
    run: scenario.run,
    state: params.state,
    candle,
    // O mundo do cenário é o ao vivo: a observação nasce no instante em que fica disponível.
    sentiment: selectAvailableSentiment({
      observations: params.sentiment.map((observation) => ({
        ...observation,
        createdAt: observation.observedAt,
      })),
      closeTime: candle.closeTime,
      source: scenario.run.parameters.sentimentSource,
      insertionCutoff: candle.closeTime,
    }),
    commands: commandsAt(scenario.commands, candle.openTime),
    confirmedGapCandles: gapBefore({
      state: params.state,
      candle,
      timeframe: scenario.run.parameters.timeframe,
    }),
  };
}

// Lacuna para a frente: o chamador a declara exata, como o ao vivo e o backtest fazem.
export function gapBefore(params: {
  readonly state: EngineState;
  readonly candle: EngineCandle;
  readonly timeframe: RunParameters['timeframe'];
}): number {
  const last = params.state.signal.lastCandleOpenTime;
  if (last === null) return 0;
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  return Math.max(0, (params.candle.openTime - last) / duration - 1);
}

export function commandsAt(commands: ScenarioCommands, openTime: number): StepInput['commands'] {
  return commands[openTime] ?? [];
}

export function runSteps(params: RunStepsParams): RecordedStep[] {
  const { engine, scenario } = params;
  const candles = params.candles ?? scenario.candles;
  const sentiment = params.sentiment ?? scenario.sentiment;
  let state =
    params.initialState ??
    engine.createInitialState({ strategy: scenario.strategy, run: scenario.run });
  const steps: RecordedStep[] = [];
  for (const candle of candles) {
    const input = buildStepInput({ scenario, state, candle, sentiment });
    const result = engine.step(params.shouldFreezeInputs === true ? deepFreeze(input) : input);
    steps.push({
      candle,
      sentiment: input.sentiment,
      commands: input.commands ?? [],
      confirmedGapCandles: input.confirmedGapCandles ?? 0,
      result,
    });
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

export const FUTURE_PERTURBATION = {
  SCALE_UP: 'scale-up',
  SCALE_DOWN: 'scale-down',
  CONSTANT: 'constant',
  PERMUTED: 'permuted',
} as const;

export type FuturePerturbation = (typeof FUTURE_PERTURBATION)[keyof typeof FUTURE_PERTURBATION];

const SCALE_FACTOR: Readonly<Record<string, string>> = {
  [FUTURE_PERTURBATION.SCALE_UP]: '1.37',
  [FUTURE_PERTURBATION.SCALE_DOWN]: '0.63',
};

function scaleCandle(candle: EngineCandle, factor: string): EngineCandle {
  const scale = (price: string): string =>
    formatEngineDecimal(toEngineDecimal(price).times(factor));
  return {
    ...candle,
    open: scale(candle.open),
    high: scale(candle.high),
    low: scale(candle.low),
    close: scale(candle.close),
    volume: formatEngineDecimal(new EngineDecimal(candle.volume).plus(1)),
  };
}

function flatCandle(candle: EngineCandle, price: string): EngineCandle {
  return { ...candle, open: price, high: price, low: price, close: price };
}

function withPricesOf(candle: EngineCandle, source: EngineCandle): EngineCandle {
  const { open, high, low, close, volume } = source;
  return { ...candle, open, high, low, close, volume };
}

// Futuro adulterado e ainda válido (máxima e mínima envolvem abertura e fechamento; grade intacta).
export function mutateCandlesAfter(
  candles: readonly EngineCandle[],
  cutIndex: number,
  perturbation: FuturePerturbation,
): EngineCandle[] {
  const future = candles.slice(cutIndex + 1);
  const anchor = candles[cutIndex]?.close ?? '1';
  const mutated = future.map((candle, index) => {
    if (perturbation === FUTURE_PERTURBATION.CONSTANT) return flatCandle(candle, anchor);
    if (perturbation === FUTURE_PERTURBATION.PERMUTED) {
      return withPricesOf(candle, future[future.length - 1 - index] ?? candle);
    }
    return scaleCandle(candle, SCALE_FACTOR[perturbation] ?? '1');
  });
  return [...candles.slice(0, cutIndex + 1), ...mutated];
}

// Sentimento que só fica disponível depois do corte: valor espelhado (20 ↔ 80) e uma observação nova.
export function mutateSentimentAfter(
  observations: readonly SentimentObservation[],
  cutCloseTime: number,
): SentimentObservation[] {
  const mirrored = observations.map((observation) =>
    observation.observedAt > cutCloseTime
      ? { ...observation, value: 100 - observation.value }
      : observation,
  );
  const injected = { value: 99, observedAt: cutCloseTime + 1, source: 'perturbation' };
  return [...mirrored, injected];
}

export function isFresh(observation: SentimentObservation | undefined, closeTime: number): boolean {
  return (
    observation !== undefined &&
    closeTime - observation.observedAt <= SENTIMENT_STALE_AFTER_MILLISECONDS
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
    ['command', decisions.commands],
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
