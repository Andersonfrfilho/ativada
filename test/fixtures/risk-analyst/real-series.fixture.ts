// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createStrategySignalState,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  signalStep,
  type EngineCandle,
  type EngineMarket,
  type SentimentObservation,
} from '../../../packages/strategy-engine/src/index.js';
import type { AuditorCandle, AuditorVote } from './auditor-oracle.fixture.js';
import { auditedVersion, type AuditedKey } from './specialist-dataset.fixture.js';

// Série de votos de UM item auditado sobre velas e Fear & Greed REAIS (T0.2 da spec 007): o mesmo `signalStep` de produção
// do conjunto sintético, mas com o sentimento do banco (uma leitura por dia UTC, disponível à 00:00 do dia).

export type FearGreedDay = { readonly observedAt: number; readonly value: number };

function voteOf(score: string): AuditorVote {
  if (score.startsWith('-')) return -1;
  return /^0(\.0*)?$/.test(score) ? 0 : 1;
}

// A leitura mais nova com `observedAt <= closeTime`; a lista vem em ordem crescente.
function sentimentAt(params: {
  readonly fearGreed: readonly FearGreedDay[];
  readonly closeTime: number;
  readonly source: string;
}): SentimentObservation | undefined {
  let low = 0;
  let high = params.fearGreed.length - 1;
  let found: FearGreedDay | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const day = params.fearGreed[middle];
    if (day === undefined) break;
    if (day.observedAt <= params.closeTime) {
      found = day;
      low = middle + 1;
    } else high = middle - 1;
  }
  if (found === undefined) return undefined;
  return { value: found.value, observedAt: found.observedAt, source: params.source };
}

export type BuildRealSeriesParams = {
  readonly candles: readonly EngineCandle[];
  readonly market: EngineMarket;
  readonly key: AuditedKey;
  readonly fearGreed: readonly FearGreedDay[];
};

export function buildRealAuditorSeries(params: BuildRealSeriesParams): AuditorCandle[] {
  const { candles, market, key, fearGreed } = params;
  const strategy = auditedVersion(key);
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[market.timeframe];
  let state = createStrategySignalState(strategy.config);
  let previousOpenTime: number | undefined;
  return candles.map((candle) => {
    const confirmedGapCandles =
      previousOpenTime === undefined ? 0 : (candle.openTime - previousOpenTime) / duration - 1;
    previousOpenTime = candle.openTime;
    const sentiment = sentimentAt({
      fearGreed,
      closeTime: candle.closeTime,
      source: market.sentimentSource,
    });
    const stepped = signalStep({ strategy, market, state, candle, sentiment, confirmedGapCandles });
    state = stepped.state;
    const vote = stepped.signal === null ? null : voteOf(stepped.signal.score);
    return { openTime: candle.openTime, close: candle.close, vote };
  });
}
