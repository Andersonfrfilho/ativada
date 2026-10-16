// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createStrategySignalState,
  createStrategyVersion,
  decimalFromIndicator,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  formatEngineDecimal,
  RISK_ATR_INDICATOR_ID,
  selectAvailableSentiment,
  signalStep,
  toEngineDecimal,
  type EngineCandle,
  type EngineMarket,
  type SentimentObservation,
  type SignalDecision,
  type StoredSentimentObservation,
  type StrategyVersion,
} from '@ativada/strategy-engine';

import {
  ANALYST_RULES,
  CANDLE_MILLISECONDS,
  SPECIALIST_KEY,
  type SpecialistKey,
} from './analyst.constant.js';
import type { AnalystVote, TeamSeries, VoteReading } from './analyst.types.js';
import { SPECIALIST_CATALOG } from './specialist-catalog.js';

export const SPECIALIST_VERSIONS: Readonly<Record<SpecialistKey, StrategyVersion>> = {
  trend: createStrategyVersion(SPECIALIST_CATALOG.trend.config),
  reversion: createStrategyVersion(SPECIALIST_CATALOG.reversion.config),
  volume: createStrategyVersion(SPECIALIST_CATALOG.volume.config),
  sentiment: createStrategyVersion(SPECIALIST_CATALOG.sentiment.config),
};

export type SelectSentimentsParams = {
  readonly candles: readonly EngineCandle[];
  readonly observations: readonly StoredSentimentObservation[];
  readonly source: string;
};

// A leitura que o passo recebe em cada vela: a mais nova da fonte, inserida e DISPONÍVEL até o fechamento dela (o corte
// de inserção é o fechamento: nada que chegou depois entra, como no backtest e no ao vivo).
export function selectSentiments(
  params: SelectSentimentsParams,
): readonly (SentimentObservation | undefined)[] {
  const { candles, observations, source } = params;
  return candles.map((candle) =>
    selectAvailableSentiment({
      observations,
      closeTime: candle.closeTime,
      source,
      insertionCutoff: candle.closeTime,
    }),
  );
}

// Lado do placar: negativo vota -1, zero vota 0, positivo vota +1.
function voteOfScore(score: string): AnalystVote {
  const value = toEngineDecimal(score);
  if (value.isNegative() && !value.isZero()) return -1;
  return value.isZero() ? 0 : 1;
}

function atrOf(signal: SignalDecision): string | null {
  const atr = signal.indicators[RISK_ATR_INDICATOR_ID];
  if (atr === undefined || atr === null) return null;
  return formatEngineDecimal(decimalFromIndicator(atr));
}

function readingOf(candle: EngineCandle, signal: SignalDecision | null): VoteReading {
  if (signal === null) {
    return {
      openTime: candle.openTime,
      close: candle.close,
      vote: null,
      isMissing: false,
      atr: null,
    };
  }
  return {
    openTime: candle.openTime,
    close: candle.close,
    vote: voteOfScore(signal.score),
    isMissing: signal.votes.length > 0 && signal.votes.every((vote) => vote.isMissing),
    atr: atrOf(signal),
  };
}

export type VoteCursor = {
  readonly state: ReturnType<typeof createStrategySignalState>;
  readonly previousOpenTime: number | undefined;
};

export function createVoteCursor(strategy: StrategyVersion): VoteCursor {
  return { state: createStrategySignalState(strategy.config), previousOpenTime: undefined };
}

export type AdvanceVoteParams = {
  readonly strategy: StrategyVersion;
  readonly market: EngineMarket;
  readonly cursor: VoteCursor;
  readonly candle: EngineCandle;
  readonly sentiment: SentimentObservation | undefined;
};

// Um passo do `signalStep` de PRODUÇÃO com a lacuna declarada exata entre velas não contíguas (RF03, A3). É o mesmo passo
// da série inteira e do avanço incremental do worker, então os dois dão o mesmo voto vela a vela.
export function advanceVote(params: AdvanceVoteParams): {
  readonly cursor: VoteCursor;
  readonly reading: VoteReading;
} {
  const { strategy, market, cursor, candle, sentiment } = params;
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[market.timeframe];
  const { previousOpenTime } = cursor;
  const confirmedGapCandles =
    previousOpenTime === undefined ? 0 : (candle.openTime - previousOpenTime) / duration - 1;
  const stepped = signalStep({
    strategy,
    market,
    state: cursor.state,
    candle,
    sentiment,
    confirmedGapCandles,
  });
  return {
    cursor: { state: stepped.state, previousOpenTime: candle.openTime },
    reading: readingOf(candle, stepped.signal),
  };
}

export type VoteSeriesParams = {
  readonly strategy: StrategyVersion;
  readonly market: EngineMarket;
  readonly candles: readonly EngineCandle[];
  // Alinhada às velas (mesmo índice): a leitura de sentimento disponível no fechamento de cada uma.
  readonly sentiments: readonly (SentimentObservation | undefined)[];
};

export function computeVoteSeries(params: VoteSeriesParams): readonly VoteReading[] {
  const { strategy, market, candles, sentiments } = params;
  let cursor = createVoteCursor(strategy);
  return candles.map((candle, index) => {
    const advanced = advanceVote({
      strategy,
      market,
      cursor,
      candle,
      sentiment: sentiments[index],
    });
    cursor = advanced.cursor;
    return advanced.reading;
  });
}

export type SpecialistTeamParams = Omit<VoteSeriesParams, 'strategy'>;

// Os quatro especialistas sobre a mesma série e o mesmo sentimento.
export function runSpecialistTeam(params: SpecialistTeamParams): TeamSeries {
  const seriesOf = (key: SpecialistKey): readonly VoteReading[] =>
    computeVoteSeries({ ...params, strategy: SPECIALIST_VERSIONS[key] });
  return {
    [SPECIALIST_KEY.TREND]: seriesOf(SPECIALIST_KEY.TREND),
    [SPECIALIST_KEY.REVERSION]: seriesOf(SPECIALIST_KEY.REVERSION),
    [SPECIALIST_KEY.VOLUME]: seriesOf(SPECIALIST_KEY.VOLUME),
    [SPECIALIST_KEY.SENTIMENT]: seriesOf(SPECIALIST_KEY.SENTIMENT),
  };
}

// Âncora diária da série de uma decisão (A3): 00:00 UTC do dia que contém `t − 3.080·d` (2.880 da janela + 200 de
// aquecimento), para o EMA começar sempre no mesmo lugar no mesmo dia.
export function computeSeriesAnchor(candleTime: number): number {
  const { auditWindowCandles, seriesLeadInCandles, seriesAnchorMilliseconds } = ANALYST_RULES;
  const earliest = candleTime - (auditWindowCandles + seriesLeadInCandles) * CANDLE_MILLISECONDS;
  return Math.floor(earliest / seriesAnchorMilliseconds) * seriesAnchorMilliseconds;
}
