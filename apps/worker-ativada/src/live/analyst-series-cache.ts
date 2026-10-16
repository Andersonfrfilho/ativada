// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  advanceVote,
  CANDLE_MILLISECONDS,
  computeSeriesAnchor,
  createVoteCursor,
  selectSentiments,
  SPECIALIST_KEY,
  SPECIALIST_KEYS,
  SPECIALIST_VERSIONS,
  type SpecialistKey,
  type TeamSeries,
  type VoteCursor,
  type VoteReading,
} from '@ativada/risk-analyst';
import type {
  EngineCandle,
  EngineMarket,
  StoredSentimentObservation,
} from '@ativada/strategy-engine';

import { AnalystFailure } from './analyst-failure.js';
import { ANALYST_FAILURE_CODE, ANALYST_SERIES_ANCHORS_PER_PAIR } from './analyst-live.constant.js';
import type { LiveRunSession } from './live-run.types.js';

export type SeriesSource = {
  readonly findCandles: LiveRunSession['findCandles'];
  readonly observations: readonly StoredSentimentObservation[];
  // A última vela que o chamador já sabe fechada: a série é estendida até ela de uma vez, numa só leitura.
  readonly lastOpenTime: number;
};

export type SeriesRequest = {
  readonly market: EngineMarket;
  readonly candleTime: number;
  readonly source: SeriesSource;
};

// A série do par com abertura em `[âncora, t]`: velas e o voto dos quatro especialistas, alinhados pelo índice.
export type PairSeries = { readonly candles: readonly EngineCandle[]; readonly team: TeamSeries };

export type AnalystSeriesCache = { readonly read: (request: SeriesRequest) => Promise<PairSeries> };

type Entry = {
  readonly candles: EngineCandle[];
  readonly votes: Record<SpecialistKey, VoteReading[]>;
  readonly cursors: Record<SpecialistKey, VoteCursor>;
  nextFrom: number;
  pending: Promise<void>;
};

function createEntry(anchor: number): Entry {
  const cursorOf = (key: SpecialistKey): VoteCursor => createVoteCursor(SPECIALIST_VERSIONS[key]);
  return {
    candles: [],
    votes: {
      [SPECIALIST_KEY.TREND]: [],
      [SPECIALIST_KEY.REVERSION]: [],
      [SPECIALIST_KEY.VOLUME]: [],
      [SPECIALIST_KEY.SENTIMENT]: [],
    },
    cursors: {
      [SPECIALIST_KEY.TREND]: cursorOf(SPECIALIST_KEY.TREND),
      [SPECIALIST_KEY.REVERSION]: cursorOf(SPECIALIST_KEY.REVERSION),
      [SPECIALIST_KEY.VOLUME]: cursorOf(SPECIALIST_KEY.VOLUME),
      [SPECIALIST_KEY.SENTIMENT]: cursorOf(SPECIALIST_KEY.SENTIMENT),
    },
    nextFrom: anchor,
    pending: Promise.resolve(),
  };
}

function lastOpenTimeOf(entry: Entry): number {
  return entry.candles.at(-1)?.openTime ?? Number.NEGATIVE_INFINITY;
}

async function readFresh(entry: Entry, request: SeriesRequest): Promise<readonly EngineCandle[]> {
  const to = Math.max(request.source.lastOpenTime, request.candleTime) + CANDLE_MILLISECONDS;
  try {
    return await request.source.findCandles({
      from: entry.nextFrom,
      to,
      limit: (to - entry.nextFrom) / CANDLE_MILLISECONDS,
    });
  } catch {
    throw new AnalystFailure(ANALYST_FAILURE_CODE.SERIES_UNAVAILABLE);
  }
}

// O `signalStep` de PRODUÇÃO continua de onde parou: o mesmo passo da série inteira desde a âncora (A3). Os quatro avançam
// ou nenhum: um erro do motor no meio não deixa a cópia com velas sem voto.
function absorb(entry: Entry, fresh: readonly EngineCandle[], request: SeriesRequest): void {
  const { market, source } = request;
  const sentiments = selectSentiments({
    candles: fresh,
    observations: source.observations,
    source: market.sentimentSource,
  });
  const advanced = SPECIALIST_KEYS.map((key) => {
    let cursor = entry.cursors[key];
    const readings = fresh.map((candle, index) => {
      const step = advanceVote({
        strategy: SPECIALIST_VERSIONS[key],
        market,
        cursor,
        candle,
        sentiment: sentiments[index],
      });
      cursor = step.cursor;
      return step.reading;
    });
    return { key, cursor, readings };
  });
  for (const { key, cursor, readings } of advanced) {
    entry.votes[key].push(...readings);
    entry.cursors[key] = cursor;
  }
  entry.candles.push(...fresh);
  const last = fresh.at(-1);
  if (last !== undefined) entry.nextFrom = last.openTime + CANDLE_MILLISECONDS;
}

async function extendIfNeeded(entry: Entry, request: SeriesRequest): Promise<void> {
  if (lastOpenTimeOf(entry) >= request.candleTime) return;
  const fresh = await readFresh(entry, request);
  if (fresh.length > 0) absorb(entry, fresh, request);
}

// Quantas velas têm abertura até `candleTime` (busca binária: a série é crescente).
function countUpTo(candles: readonly EngineCandle[], candleTime: number): number {
  let low = 0;
  let high = candles.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((candles[middle]?.openTime ?? Number.POSITIVE_INFINITY) <= candleTime) low = middle + 1;
    else high = middle;
  }
  return low;
}

function viewUpTo(entry: Entry, candleTime: number): PairSeries {
  const end = countUpTo(entry.candles, candleTime);
  if (entry.candles[end - 1]?.openTime !== candleTime) {
    throw new AnalystFailure(ANALYST_FAILURE_CODE.SERIES_UNAVAILABLE);
  }
  return {
    candles: entry.candles.slice(0, end),
    team: {
      [SPECIALIST_KEY.TREND]: entry.votes.trend.slice(0, end),
      [SPECIALIST_KEY.REVERSION]: entry.votes.reversion.slice(0, end),
      [SPECIALIST_KEY.VOLUME]: entry.votes.volume.slice(0, end),
      [SPECIALIST_KEY.SENTIMENT]: entry.votes.sentiment.slice(0, end),
    },
  };
}

function evictOldAnchors(anchors: Map<number, Entry>): void {
  const newestFirst = [...anchors.keys()].sort((first, second) => second - first);
  for (const anchor of newestFirst.slice(ANALYST_SERIES_ANCHORS_PER_PAIR)) anchors.delete(anchor);
}

// UMA leitura de velas por par por ronda (A3): as simulações do mesmo par dividem a série. Não é estado da simulação (que
// continua só no checkpoint): reinício ou âncora nova recomeça do zero e dá o MESMO resultado do recálculo desde a âncora.
export function createAnalystSeriesCache(): AnalystSeriesCache {
  const pairs = new Map<string, Map<number, Entry>>();
  return {
    read: async (request): Promise<PairSeries> => {
      const pairKey = `${request.market.symbol}|${request.market.sentimentSource}`;
      const anchor = computeSeriesAnchor(request.candleTime);
      const anchors = pairs.get(pairKey) ?? new Map<number, Entry>();
      pairs.set(pairKey, anchors);
      const entry = anchors.get(anchor) ?? createEntry(anchor);
      anchors.set(anchor, entry);
      evictOldAnchors(anchors);
      const turn = entry.pending.then(() => extendIfNeeded(entry, request));
      entry.pending = turn.catch(() => undefined);
      await turn;
      return viewUpTo(entry, request.candleTime);
    },
  };
}
