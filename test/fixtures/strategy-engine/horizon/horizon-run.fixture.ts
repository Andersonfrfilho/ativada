// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  horizonCandlesOf as engineHorizonCandlesOf,
  type EngineCandle,
} from '../../../../packages/strategy-engine/src/index.js';
import { toEngineDecimal } from '../../../../packages/strategy-engine/src/engine-decimal.js';
import { computeGoalSignals } from '../../../../packages/strategy-engine/src/goal/goal-signals.js';
import type { HorizonWindows } from '../../../../packages/strategy-engine/src/horizon/horizon.types.js';
import type { GoalScenario } from '../goal/goal-scenarios.fixture.js';
import type { HorizonApi } from './horizon-api.fixture.js';

export type RunHorizonParams = {
  readonly api: HorizonApi;
  readonly scenario: GoalScenario;
  readonly horizonDays: number;
  // Série usada no lugar da do cenário (prefixos e caudas trocadas).
  readonly candles?: readonly EngineCandle[] | undefined;
};

export function horizonCandlesOf(scenario: GoalScenario, horizonDays: number): number {
  return engineHorizonCandlesOf(horizonDays, scenario.run.parameters.timeframe);
}

function signalsOf(
  scenario: GoalScenario,
  candles: readonly EngineCandle[],
): ReturnType<typeof computeGoalSignals> {
  return computeGoalSignals({
    strategy: scenario.strategy,
    run: scenario.run,
    candles,
    sentiments: scenario.sentiments?.slice(0, candles.length),
  });
}

// A forma de produção: sinais da série UMA vez, depois as janelas do prazo.
export function computeScenarioWindows(params: RunHorizonParams): HorizonWindows {
  const { scenario, api } = params;
  const candles = params.candles ?? scenario.candles;
  return api.computeHorizonWindows({
    strategy: scenario.strategy,
    run: scenario.run,
    candles,
    signals: signalsOf(scenario, candles),
    horizonCandles: horizonCandlesOf(scenario, params.horizonDays),
    initial: toEngineDecimal(scenario.run.parameters.initialBalance),
  });
}

export function firstDecidedIndexOf(
  scenario: GoalScenario,
  candles: readonly EngineCandle[],
): number {
  const signals = signalsOf(scenario, candles);
  const index = signals.findIndex((signal) => signal !== null);
  return index === -1 ? signals.length : index;
}
