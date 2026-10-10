// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalRecord, GoalRepository, OwnerScope } from '@cryptoada/database';
import { GoalInputError, rankGoalCombinations } from '@cryptoada/strategy-engine';

import {
  evaluateCombination,
  type CombinationDependencies,
  type StrategyEntry,
} from './goal-evaluation-combination.js';
import { loadGoalStrategies, type GoalStrategyReader } from './goal-evaluation-strategies.js';
import {
  loadSymbolSeries,
  type SeriesReader,
  type SymbolSeries,
} from './goal-evaluation-series.js';
import {
  toSituationView,
  type GoalCombinationView,
  type GoalEvaluationView,
  type GoalUnavailableView,
} from './goal-evaluation-view.js';
import { toGoalView } from './goal-views.js';
import { GoalNotFoundError } from './goal.error.js';
import { GOAL_EVALUATION_TIMEFRAME } from './goal.constant.js';

export type GoalEvaluationDependencies = CombinationDependencies &
  SeriesReader & {
    readonly goals: Pick<GoalRepository, 'findGoal'>;
    readonly strategies: GoalStrategyReader;
    readonly symbols: readonly string[];
    readonly now: () => number;
  };

export type EvaluateGoalUseCase = (
  scope: OwnerScope,
  goalId: string,
) => Promise<GoalEvaluationView>;

type Cell = { readonly view: GoalCombinationView } | { readonly unavailable: GoalUnavailableView };

const INVALID_STRATEGY_REASON = 'INVALID_STRATEGY_CONFIG';

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Uma combinação (estratégia × par). Candle que o motor recusa a deixa "indisponível"; qualquer outro erro é defeito.
async function evaluateCell(
  dependencies: GoalEvaluationDependencies,
  params: {
    readonly scope: OwnerScope;
    readonly goal: GoalRecord;
    readonly entry: StrategyEntry;
    readonly series: SymbolSeries;
  },
): Promise<Cell> {
  const { entry, series, goal } = params;
  try {
    const sentiments = entry.usesSentiment ? await series.loadSentiments() : undefined;
    const computed = evaluateCombination(dependencies, {
      goal,
      entry,
      run: series.run,
      candles: series.candles,
      sentiments,
    });
    return {
      view: {
        rank: 0,
        strategy: entry.ref,
        symbol: series.symbol,
        isGoalSymbol: series.symbol === goal.symbol,
        candlesUsed: series.candles.length,
        lastCandleOpenTime: series.candles.at(-1)?.openTime ?? null,
        evaluation: computed.evaluation,
        situation: toSituationView(computed.situation),
      },
    };
  } catch (error: unknown) {
    if (!(error instanceof GoalInputError)) throw error;
    return { unavailable: { strategyId: entry.ref.id, symbol: series.symbol, reason: error.code } };
  }
}

// Em sequência, cedendo o laço de eventos entre as combinações: a avaliação é síncrona no motor e não pode prender a API.
async function evaluateAll(
  dependencies: GoalEvaluationDependencies,
  params: {
    readonly scope: OwnerScope;
    readonly goal: GoalRecord;
    readonly entries: readonly StrategyEntry[];
    readonly series: readonly SymbolSeries[];
  },
): Promise<{ views: GoalCombinationView[]; unavailable: GoalUnavailableView[] }> {
  const views: GoalCombinationView[] = [];
  const unavailable: GoalUnavailableView[] = [];
  for (const entry of params.entries) {
    for (const series of params.series) {
      const cell = await evaluateCell(dependencies, { ...params, entry, series });
      if ('view' in cell) views.push(cell.view);
      else unavailable.push(cell.unavailable);
      await yieldToEventLoop();
    }
  }
  return { views, unavailable };
}

function rankViews(views: readonly GoalCombinationView[]): GoalCombinationView[] {
  const ranked = rankGoalCombinations(
    views.map((view) => ({
      key: `${view.strategy.name}\u0000${view.symbol}\u0000${view.strategy.id}`,
      evaluation: view.evaluation,
      view,
    })),
  );
  return ranked.map((entry, index) => ({ ...entry.view, rank: index + 1 }));
}

// O ranking estratégia × par de uma meta (RF13, ADR 0002 §"Metas (T4b.3)"): para cada estratégia do dono (as mais novas, na versão
// mais recente) e cada par habilitado, a avaliação sobre os candles diários armazenados, ordenada por
// `rankGoalCombinations`. O que já foi calculado para a mesma meta, versão, par e último candle vem do cache.
export function createGoalEvaluationUseCase(
  dependencies: GoalEvaluationDependencies,
): EvaluateGoalUseCase {
  return async (scope, goalId) => {
    const goal = await dependencies.goals.findGoal(scope, goalId);
    if (goal === undefined) throw new GoalNotFoundError();
    const loaded = await loadGoalStrategies(dependencies.strategies, scope);
    const now = dependencies.now();
    const series = await Promise.all(
      dependencies.symbols.map((symbol) => loadSymbolSeries(dependencies, { symbol, now })),
    );
    const evaluated = await evaluateAll(dependencies, {
      scope,
      goal,
      entries: loaded.entries,
      series,
    });
    const invalid = loaded.invalid.flatMap((strategyId) =>
      dependencies.symbols.map((symbol) => ({
        strategyId,
        symbol,
        reason: INVALID_STRATEGY_REASON,
      })),
    );
    return {
      goal: toGoalView(goal),
      timeframe: GOAL_EVALUATION_TIMEFRAME,
      evaluatedStrategies: loaded.entries.length,
      isStrategyListTruncated: loaded.isTruncated,
      combinations: rankViews(evaluated.views),
      unavailable: [...evaluated.unavailable, ...invalid],
    };
  };
}
