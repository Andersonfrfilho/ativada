// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toIndicatorCandle } from '../compute-indicator-series.js';
import type { EngineCandle, SentimentObservation } from '../engine-candle.types.js';
import type { SignalDecision } from '../engine-decision.types.js';
import { signalStep } from '../signal-step.js';
import { advanceIndicators } from '../signal-indicators.js';
import type { RunSetup, StrategyVersion } from '../strategy-config.types.js';
import { createStrategySignalState } from '../strategy-horizons.js';
import { computeNextTriggers } from './compute-next-triggers.js';
import type { TriggerState } from './trigger.constant.js';
import type { NextTriggers } from './trigger.types.js';

export type ComputeLatestTriggersParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  // Alinhada ao `candles` (mesmo índice), como na avaliação da meta.
  readonly sentiments: readonly (SentimentObservation | undefined)[] | undefined;
  readonly state: TriggerState;
};

export type LatestTriggers = {
  readonly signal: SignalDecision;
  readonly triggers: NextTriggers;
};

// A situação no ÚLTIMO candle fechado da série: o sinal que o placar deu e o que falta para cada regra disparar. O sinal
// roda até o penúltimo candle só para chegar ao estado dos indicadores; as leituras do último vêm de avançá-los uma vez.
// Série mais curta que o aquecimento (ou vazia) não tem sinal nem gatilhos: `null`.
export function computeLatestTriggers(params: ComputeLatestTriggersParams): LatestTriggers | null {
  const { strategy, run, candles, sentiments } = params;
  const lastIndex = candles.length - 1;
  const last = candles[lastIndex];
  if (last === undefined) return null;
  let state = createStrategySignalState(strategy.config);
  for (const [index, candle] of candles.slice(0, lastIndex).entries()) {
    state = signalStep({
      strategy,
      market: run.parameters,
      state,
      candle,
      sentiment: sentiments?.[index],
    }).state;
  }
  const sentiment = sentiments?.[lastIndex];
  const { signal } = signalStep({
    strategy,
    market: run.parameters,
    state,
    candle: last,
    sentiment,
  });
  if (signal === null) return null;
  const { readings } = advanceIndicators({
    config: strategy.config,
    snapshots: state.indicators,
    candle: toIndicatorCandle(last),
  });
  const triggers = computeNextTriggers({
    config: strategy.config,
    readings,
    close: last.close,
    closeTime: last.closeTime,
    sentiment,
    sentimentSource: run.parameters.sentimentSource,
    state: params.state,
  });
  return { signal, triggers };
}
