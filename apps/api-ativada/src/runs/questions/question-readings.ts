// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository, SentimentObservationRepository } from '@ativada/database';
import { toEngineCandle } from '@ativada/run-recording';
import {
  computeLatestTriggers,
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  TRIGGER_STATE,
  type EngineCandle,
  type LatestTriggers,
  type SentimentObservation,
  type StrategyConfig,
  type EngineTimeframe,
} from '@ativada/strategy-engine';

import { latestContiguousSpan, loadGoalSentiments } from '../../goals/goal-evaluation-candles.js';
import { setupFor } from '../../goals/goal-evaluation-series.js';
import { DEFAULT_SENTIMENT_SOURCE } from '../runs.constant.js';
import { QUESTION_CACHE_MAX_ENTRIES, QUESTION_CANDLE_WINDOW } from './questions.constant.js';

export type QuestionReadingsDependencies = {
  readonly candles: Pick<CandleRepository, 'findCandles'>;
  readonly sentiments: Pick<SentimentObservationRepository, 'listAvailable'>;
  readonly exchange: string;
  readonly now: () => number;
  readonly cache: QuestionReadingsCache;
};

// O que as respostas de leitura usam: a situação do placar na última vela (nula no aquecimento) e o sentimento dela.
export type SymbolReadings = {
  readonly latest: LatestTriggers | null;
  readonly sentiment: SentimentObservation | undefined;
};

export type QuestionCandles = {
  readonly candles: readonly EngineCandle[];
  readonly last: EngineCandle | undefined;
};

export type QuestionReadingsCache = {
  readonly get: (key: string) => SymbolReadings | undefined;
  readonly set: (key: string, readings: SymbolReadings) => void;
};

export function createQuestionReadingsCache(
  maxEntries: number = QUESTION_CACHE_MAX_ENTRIES,
): QuestionReadingsCache {
  const entries = new Map<string, SymbolReadings>();
  return {
    get: (key): SymbolReadings | undefined => entries.get(key),
    set: (key, readings): void => {
      entries.delete(key);
      entries.set(key, readings);
      if (entries.size <= maxEntries) return;
      const oldest = entries.keys().next();
      if (oldest.done !== true) entries.delete(oldest.value);
    },
  };
}

type SeriesParams = { readonly symbol: string; readonly timeframe: EngineTimeframe };

// Candle é dado público de mercado (sem dono): as últimas velas FECHADAS do par no timeframe da execução, só o trecho contíguo.
export async function loadQuestionCandles(
  dependencies: Pick<QuestionReadingsDependencies, 'candles' | 'exchange' | 'now'>,
  params: SeriesParams,
): Promise<QuestionCandles> {
  const durationMilliseconds = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  const now = dependencies.now();
  const records = await dependencies.candles.findCandles({
    exchange: dependencies.exchange,
    symbol: params.symbol,
    timeframe: params.timeframe,
    from: now - QUESTION_CANDLE_WINDOW * durationMilliseconds,
    to: now,
  });
  const closed = records.map(toEngineCandle).filter((candle) => candle.closeTime <= now);
  const candles = latestContiguousSpan({ candles: closed, durationMilliseconds });
  return { candles, last: candles.at(-1) };
}

// A situação do placar no último fechamento, com as MESMAS funções do próximo gatilho (nada de conta nova de indicador). Em
// cache por versão da estratégia, par, timeframe e última vela: a mesma pergunta na mesma vela não refaz a série.
export async function readSymbolReadings(
  dependencies: QuestionReadingsDependencies,
  params: SeriesParams & {
    readonly versionId: string;
    readonly config: StrategyConfig;
    readonly series: QuestionCandles;
  },
): Promise<SymbolReadings> {
  const { candles, last } = params.series;
  const key = JSON.stringify([params.versionId, params.symbol, params.timeframe, last?.openTime]);
  const cached = dependencies.cache.get(key);
  if (cached !== undefined) return cached;
  const sentiments = await loadGoalSentiments(dependencies.sentiments, {
    candles,
    source: DEFAULT_SENTIMENT_SOURCE,
  });
  const latest = computeLatestTriggers({
    strategy: createStrategyVersion(params.config),
    run: setupFor(params.symbol, params.timeframe),
    candles,
    sentiments,
    state: TRIGGER_STATE.AWAITING_ENTRY,
  });
  const readings = { latest, sentiment: sentiments.at(-1) };
  dependencies.cache.set(key, readings);
  return readings;
}
