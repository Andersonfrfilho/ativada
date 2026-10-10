// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CANDLE_TIMEFRAMES } from './candle.constant.js';

export type CandleTimeframe = (typeof CANDLE_TIMEFRAMES)[number];

// Preços e volume são string decimal: nada de float entre a Binance e o banco (constituição §6).
export type CandleRecord = {
  readonly exchange: string;
  readonly symbol: string;
  readonly timeframe: CandleTimeframe;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
  readonly tradeCount: number;
};

export type CandleSeriesKey = {
  readonly exchange: string;
  readonly symbol: string;
  readonly timeframe: CandleTimeframe;
};

// Intervalo semi-aberto em milissegundos: `from` incluído, `to` excluído.
export type FindCandlesParams = CandleSeriesKey & {
  readonly from: number;
  readonly to: number;
  // Teto de linhas (leitura do primeiro candle, páginas); ausente = o intervalo inteiro.
  readonly limit?: number | undefined;
};

export type FindMissingOpenTimesParams = CandleSeriesKey & {
  readonly from: number;
  readonly to: number;
};

export type UpsertCandlesResult = { readonly inserted: number };

export type CandleRepositoryOptions = { readonly now?: () => number };

export type CandleRepository = {
  readonly upsertCandles: (candles: readonly CandleRecord[]) => Promise<UpsertCandlesResult>;
  readonly findCandles: (params: FindCandlesParams) => Promise<readonly CandleRecord[]>;
  readonly findMissingOpenTimes: (params: FindMissingOpenTimesParams) => Promise<readonly number[]>;
  readonly findLatestOpenTime: (key: CandleSeriesKey) => Promise<number | undefined>;
};
