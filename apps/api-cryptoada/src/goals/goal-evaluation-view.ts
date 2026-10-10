// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalEvaluation, LatestTriggers } from '@cryptoada/strategy-engine';

import type { GoalView } from './goal-views.js';

export type GoalStrategyRef = {
  readonly id: string;
  readonly name: string;
  readonly versionId: string;
  readonly version: number;
};

export type GoalSituationView = {
  readonly signal: {
    readonly action: string;
    readonly score: string;
    readonly regime: string;
    readonly reason: string;
  };
  readonly triggers: LatestTriggers['triggers'];
};

export type GoalCombinationView = {
  readonly rank: number;
  readonly strategy: GoalStrategyRef;
  readonly symbol: string;
  // O par da meta: a combinação que o usuário provavelmente quer seguir.
  readonly isGoalSymbol: boolean;
  readonly candlesUsed: number;
  readonly lastCandleOpenTime: number | null;
  readonly evaluation: GoalEvaluation;
  readonly situation: GoalSituationView | null;
};

export type GoalUnavailableView = {
  readonly strategyId: string;
  readonly symbol: string;
  readonly reason: string;
};

export type GoalEvaluationView = {
  readonly goal: GoalView;
  readonly timeframe: string;
  readonly evaluatedStrategies: number;
  // Havia mais estratégias do que cabem na avaliação: só as mais novas entraram.
  readonly isStrategyListTruncated: boolean;
  readonly combinations: readonly GoalCombinationView[];
  readonly unavailable: readonly GoalUnavailableView[];
};

export function toSituationView(situation: LatestTriggers | null): GoalSituationView | null {
  if (situation === null) return null;
  const { signal, triggers } = situation;
  return {
    signal: {
      action: signal.action,
      score: signal.score,
      regime: signal.regime,
      reason: signal.reason,
    },
    triggers,
  };
}
