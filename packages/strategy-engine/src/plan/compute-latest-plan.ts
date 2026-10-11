// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle, SentimentObservation } from '../engine-candle.types.js';
import type { SignalDecision } from '../engine-decision.types.js';
import type { GoalSpec } from '../goal/goal.types.js';
import { signalStep } from '../signal-step.js';
import type { RunSetup, StrategyVersion } from '../strategy-config.types.js';
import { createStrategySignalState } from '../strategy-horizons.js';
import { computeOperationPlan } from './compute-operation-plan.js';
import type { OperationPlan } from './plan.types.js';

export type ComputeLatestPlanParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  // Alinhada ao `candles` (mesmo índice), como na avaliação da meta.
  readonly sentiments: readonly (SentimentObservation | undefined)[] | undefined;
  readonly goal: GoalSpec;
};

// O plano depois do ÚLTIMO candle fechado da série: o sinal roda do primeiro ao último candle para chegar ao estado dos
// indicadores. Série vazia ou ainda no aquecimento não tem plano: `null`.
export function computeLatestPlan(params: ComputeLatestPlanParams): OperationPlan | null {
  const { strategy, run, candles, sentiments } = params;
  let state = createStrategySignalState(strategy.config);
  let signal: SignalDecision | null = null;
  for (const [index, candle] of candles.entries()) {
    const result = signalStep({
      strategy,
      market: run.parameters,
      state,
      candle,
      sentiment: sentiments?.[index],
    });
    state = result.state;
    signal = result.signal;
  }
  const last = candles.at(-1);
  if (last === undefined || signal === null) return null;
  return computeOperationPlan({
    strategy,
    run,
    state,
    last,
    signal,
    sentiment: sentiments?.[candles.length - 1],
    goal: params.goal,
  });
}
