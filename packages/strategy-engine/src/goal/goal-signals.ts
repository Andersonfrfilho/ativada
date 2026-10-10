// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle, SentimentObservation } from '../engine-candle.types.js';
import type { SignalDecision } from '../engine-decision.types.js';
import type { RunSetup, StrategyVersion } from '../strategy-config.types.js';
import { signalStep } from '../signal-step.js';
import { createStrategySignalState } from '../strategy-horizons.js';

export type ComputeGoalSignalsParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly sentiments: readonly (SentimentObservation | undefined)[] | undefined;
};

// Os sinais da série contínua, um por candle (nulo no aquecimento): a metade SINAL do motor roda UMA vez e as
// carteiras das janelas leem daqui (ADR 0002 §a). A série é contígua (recusa de lacuna na entrada).
export function computeGoalSignals(
  params: ComputeGoalSignalsParams,
): readonly (SignalDecision | null)[] {
  const { strategy, run, candles } = params;
  let state = createStrategySignalState(strategy.config);
  const signals: (SignalDecision | null)[] = [];
  candles.forEach((candle, index) => {
    const result = signalStep({
      strategy,
      market: run.parameters,
      state,
      candle,
      sentiment: params.sentiments?.[index],
    });
    state = result.state;
    signals.push(result.signal);
  });
  return signals;
}
