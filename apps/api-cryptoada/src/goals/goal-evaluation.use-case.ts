// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalRecord, GoalRepository, OwnerScope } from '@cryptoada/database';
import { rankGoalCombinations } from '@cryptoada/strategy-engine';

import type { ColdEvaluationGate } from './goal-cold-gate.js';
import { GOAL_COMPUTATION_KIND } from './goal-computation.js';
import {
  buildCombinationKey,
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
    // Só a avaliação que erra o cache passa por aqui: orçamento de 3 por minuto, uma em voo por usuário e teto global.
    readonly coldGate: ColdEvaluationGate<GoalEvaluationView>;
  };

export type EvaluateGoalUseCase = (
  scope: OwnerScope,
  goalId: string,
  signal?: AbortSignal,
) => Promise<GoalEvaluationView>;

type Cell = { readonly view: GoalCombinationView } | { readonly unavailable: GoalUnavailableView };

type EvaluationInput = {
  readonly goal: GoalRecord;
  readonly entries: readonly StrategyEntry[];
  readonly series: readonly SymbolSeries[];
};

type CellParams = {
  readonly goal: GoalRecord;
  readonly entry: StrategyEntry;
  readonly series: SymbolSeries;
  readonly signal: AbortSignal | undefined;
};

const INVALID_STRATEGY_REASON = 'INVALID_STRATEGY_CONFIG';

// Uma combinação (estratégia × par). Candle que o motor recusa a deixa "indisponível"; qualquer outro erro é defeito.
async function evaluateCell(
  dependencies: GoalEvaluationDependencies,
  params: CellParams,
): Promise<Cell> {
  const { entry, series, goal } = params;
  const sentiments = entry.usesSentiment ? await series.loadSentiments() : undefined;
  const computation = await evaluateCombination(dependencies, {
    goal,
    entry,
    run: series.run,
    candles: series.candles,
    sentiments,
    signal: params.signal,
  });
  if (computation.kind === GOAL_COMPUTATION_KIND.UNAVAILABLE) {
    return {
      unavailable: { strategyId: entry.ref.id, symbol: series.symbol, reason: computation.reason },
    };
  }
  return {
    view: {
      rank: 0,
      strategy: entry.ref,
      symbol: series.symbol,
      isGoalSymbol: series.symbol === goal.symbol,
      candlesUsed: series.candles.length,
      lastCandleOpenTime: series.candles.at(-1)?.openTime ?? null,
      evaluation: computation.combination.evaluation,
      situation: toSituationView(computation.combination.situation),
    },
  };
}

// Todas as combinações ao mesmo tempo: o pool limita o paralelismo. Se uma falha, as outras são canceladas, em vez de
// seguirem ocupando as threads para uma resposta que já não existe.
async function evaluateAll(
  dependencies: GoalEvaluationDependencies,
  params: EvaluationInput & { readonly signal: AbortSignal | undefined },
): Promise<{ views: GoalCombinationView[]; unavailable: GoalUnavailableView[] }> {
  const failure = new AbortController();
  const signal =
    params.signal === undefined ? failure.signal : AbortSignal.any([params.signal, failure.signal]);
  const cells = params.entries.flatMap((entry) =>
    params.series.map((series) =>
      evaluateCell(dependencies, { goal: params.goal, entry, series, signal }),
    ),
  );
  try {
    const settled = await Promise.all(cells);
    return {
      views: settled.flatMap((cell) => ('view' in cell ? [cell.view] : [])),
      unavailable: settled.flatMap((cell) => ('unavailable' in cell ? [cell.unavailable] : [])),
    };
  } catch (error: unknown) {
    failure.abort(error);
    throw error;
  }
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

function isCold(dependencies: GoalEvaluationDependencies, input: EvaluationInput): boolean {
  return input.entries.some((entry) =>
    input.series.some(
      (series) =>
        dependencies.cache.get(
          buildCombinationKey({
            goal: input.goal,
            entry,
            run: series.run,
            candles: series.candles,
          }),
        ) === undefined,
    ),
  );
}

// O ranking estratégia × par de uma meta (RF13, ADR 0002 §"Metas (T4b.3)"): para cada estratégia do dono (as mais novas, na versão
// mais recente) e cada par habilitado, a avaliação sobre os candles diários armazenados, ordenada por
// `rankGoalCombinations`. O que já foi calculado para a mesma meta, versão, par e último candle vem do cache; o que falta
// é calculado no pool de threads, atrás do portão das avaliações a frio (ADR 0002 §"Metas: CPU fora da thread da API").
export function createGoalEvaluationUseCase(
  dependencies: GoalEvaluationDependencies,
): EvaluateGoalUseCase {
  return async (scope, goalId, signal) => {
    const goal = await dependencies.goals.findGoal(scope, goalId);
    if (goal === undefined) throw new GoalNotFoundError();
    const loaded = await loadGoalStrategies(dependencies.strategies, scope);
    const now = dependencies.now();
    const series = await Promise.all(
      dependencies.symbols.map((symbol) => loadSymbolSeries(dependencies, { symbol, now })),
    );
    const input: EvaluationInput = { goal, entries: loaded.entries, series };
    const evaluate = async (): Promise<GoalEvaluationView> => {
      const evaluated = await evaluateAll(dependencies, { ...input, signal });
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
    if (!isCold(dependencies, input)) return evaluate();
    return dependencies.coldGate.run(
      { scope, signature: JSON.stringify(toGoalView(goal)) },
      evaluate,
    );
  };
}
