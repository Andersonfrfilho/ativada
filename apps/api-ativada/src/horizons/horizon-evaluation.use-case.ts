// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '@ativada/database';
import { HORIZON_DAYS, recommendHorizon } from '@ativada/strategy-engine';

import type { ColdEvaluationGate } from '../goals/goal-cold-gate.js';
import type { StrategyEntry } from '../goals/goal-evaluation-combination.js';
import type { ComputeHorizonLine } from '../goals/goal-evaluation-pool.js';
import type { SeriesReader } from '../goals/goal-evaluation-series.js';
import { pickBestDaily, pickBestIntraday } from './horizon-best.js';
import type { HorizonCache, HorizonCacheKeyParams } from './horizon-cache.js';
import { HORIZON_COMPUTATION_KIND, type HorizonLine } from './horizon-computation.js';
import type {
  DailyHorizonResult,
  HorizonEvaluation,
  HorizonUnavailable,
  IntradayHorizonResult,
} from './horizon-evaluation.types.js';
import { loadHorizonSeries, type HorizonSeriesSet } from './horizon-series.js';
import { loadHorizonStrategies, type HorizonStrategyReader } from './horizon-strategies.js';

const INVALID_STRATEGY_REASON = 'INVALID_STRATEGY_CONFIG';

export type HorizonEvaluationDependencies = SeriesReader & {
  readonly strategies: HorizonStrategyReader;
  readonly now: () => number;
  readonly cache: HorizonCache;
  // O cálculo roda numa thread do pool (nunca na da API): por isso devolve uma promessa e aceita cancelamento.
  readonly computeHorizon: ComputeHorizonLine;
  // Só a avaliação que erra o cache passa por aqui: orçamento por minuto, uma em voo por usuário e teto global.
  readonly coldGate: ColdEvaluationGate<HorizonEvaluation>;
};

export type EvaluateHorizonsInput = {
  readonly symbol: string;
  readonly strategyId: string | undefined;
};

export type EvaluateHorizonsUseCase = (
  scope: OwnerScope,
  input: EvaluateHorizonsInput,
  signal?: AbortSignal,
) => Promise<HorizonEvaluation>;

type Cell =
  | { readonly entry: StrategyEntry; readonly line: HorizonLine }
  | { readonly unavailable: HorizonUnavailable };

type CellParams = {
  readonly entry: StrategyEntry;
  readonly series: HorizonSeriesSet;
  readonly signal: AbortSignal | undefined;
};

type Entries = { readonly entries: readonly StrategyEntry[]; readonly series: HorizonSeriesSet };

function cacheKeyOf(entry: StrategyEntry, series: HorizonSeriesSet): HorizonCacheKeyParams {
  return {
    strategyVersionId: entry.ref.versionId,
    symbol: series.symbol,
    lastDailyOpenTime: series.daily.candles.at(-1)?.openTime ?? null,
    lastIntradayOpenTime: series.intraday.candles.at(-1)?.openTime ?? null,
  };
}

// Uma estratégia no par: o que já foi calculado para a mesma versão e os mesmos últimos candles vem do cache.
async function evaluateCell(
  dependencies: HorizonEvaluationDependencies,
  params: CellParams,
): Promise<Cell> {
  const { entry, series } = params;
  const key = cacheKeyOf(entry, series);
  const cached = dependencies.cache.get(key);
  if (cached !== undefined) return { entry, line: cached };
  const [dailySentiments, intradaySentiments] = entry.usesSentiment
    ? await Promise.all([series.daily.loadSentiments(), series.intraday.loadSentiments()])
    : [undefined, undefined];
  const computation = await dependencies.computeHorizon(
    {
      strategy: entry.strategy,
      daily: { run: series.daily.run, candles: series.daily.candles, sentiments: dailySentiments },
      intraday: {
        run: series.intraday.run,
        candles: series.intraday.candles,
        sentiments: intradaySentiments,
      },
    },
    params.signal,
  );
  if (computation.kind === HORIZON_COMPUTATION_KIND.UNAVAILABLE) {
    return { unavailable: { strategyId: entry.ref.id, reason: computation.reason } };
  }
  dependencies.cache.set(key, computation.line);
  return { entry, line: computation.line };
}

// Todas as estratégias ao mesmo tempo: o pool limita o paralelismo. Se uma falha, as outras são canceladas, em vez de
// seguirem ocupando as threads para uma resposta que já não existe.
async function evaluateAll(
  dependencies: HorizonEvaluationDependencies,
  params: Entries & { readonly signal: AbortSignal | undefined },
): Promise<Cell[]> {
  const failure = new AbortController();
  const signal =
    params.signal === undefined ? failure.signal : AbortSignal.any([params.signal, failure.signal]);
  const cells = params.entries.map((entry) =>
    evaluateCell(dependencies, { entry, series: params.series, signal }),
  );
  try {
    return await Promise.all(cells);
  } catch (error: unknown) {
    failure.abort(error);
    throw error;
  }
}

function pickLines(cells: readonly Cell[]): Pick<HorizonEvaluation, 'daily' | 'intraday'> {
  const computed = cells.flatMap((cell) => ('line' in cell ? [cell] : []));
  const daily = HORIZON_DAYS.flatMap((horizonDays) => {
    const candidates = computed.flatMap((cell): DailyHorizonResult[] => {
      const summary = cell.line.summaries.find((row) => row.horizonDays === horizonDays);
      return summary === undefined ? [] : [{ strategy: cell.entry.ref, summary }];
    });
    const best = pickBestDaily(candidates);
    return best === undefined ? [] : [best];
  });
  const intradayCandidates = computed.flatMap((cell): IntradayHorizonResult[] =>
    cell.line.intraday === null ? [] : [{ strategy: cell.entry.ref, summary: cell.line.intraday }],
  );
  return { daily, intraday: pickBestIntraday(intradayCandidates) };
}

function toEvaluation(params: {
  readonly input: EvaluateHorizonsInput;
  readonly loaded: Awaited<ReturnType<typeof loadHorizonStrategies>>;
  readonly cells: readonly Cell[];
}): HorizonEvaluation {
  const { input, loaded, cells } = params;
  const lines = pickLines(cells);
  return {
    symbol: input.symbol,
    evaluatedStrategies: loaded.entries.length,
    isStrategyListTruncated: loaded.isTruncated,
    ...lines,
    recommendedHorizonDays: recommendHorizon(lines.daily.map((row) => row.summary)),
    unavailable: [
      ...cells.flatMap((cell) => ('unavailable' in cell ? [cell.unavailable] : [])),
      ...loaded.invalid.map((strategyId) => ({ strategyId, reason: INVALID_STRATEGY_REASON })),
    ],
  };
}

// Os prazos de UMA moeda (spec 003): para cada estratégia do dono, as janelas de 7, 15 e 30 dias sobre os candles diários e
// a linha de 15 minutos sobre os últimos 90 dias, ambas no pool de threads atrás do portão das avaliações a frio. Em cada
// linha vale a melhor estratégia; o prazo recomendável sai da regra do motor sobre essas linhas.
export function createHorizonEvaluationUseCase(
  dependencies: HorizonEvaluationDependencies,
): EvaluateHorizonsUseCase {
  return async (scope, input, signal) => {
    const loaded = await loadHorizonStrategies(dependencies.strategies, {
      scope,
      strategyId: input.strategyId,
    });
    const series = await loadHorizonSeries(dependencies, {
      symbol: input.symbol,
      now: dependencies.now(),
    });
    const evaluate = async (): Promise<HorizonEvaluation> => {
      const cells = await evaluateAll(dependencies, { entries: loaded.entries, series, signal });
      return toEvaluation({ input, loaded, cells });
    };
    const isCold = loaded.entries.some(
      (entry) => dependencies.cache.get(cacheKeyOf(entry, series)) === undefined,
    );
    if (!isCold) return evaluate();
    return dependencies.coldGate.run(
      { scope, signature: JSON.stringify([input.symbol, input.strategyId ?? null]) },
      evaluate,
    );
  };
}
