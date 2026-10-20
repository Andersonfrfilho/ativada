// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DISPLAY_CANDLE_TIMEFRAMES, RUN_CANDLE_TIMEFRAMES } from './candle.constant.js';

// `CandleTimeframe` é só o de execução (o que o motor lê); a vela de exibição entra por `StoredCandleTimeframe`.
export type CandleTimeframe = (typeof RUN_CANDLE_TIMEFRAMES)[number];
export type DisplayCandleTimeframe = (typeof DISPLAY_CANDLE_TIMEFRAMES)[number];
export type StoredCandleTimeframe = CandleTimeframe | DisplayCandleTimeframe;

// Preços e volume são string decimal: nada de float entre a Binance e o banco (constituição §6).
export type CandleRecord<TTimeframe extends StoredCandleTimeframe = CandleTimeframe> = {
  readonly exchange: string;
  readonly symbol: string;
  readonly timeframe: TTimeframe;
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
  readonly tradeCount: number;
};

export type CandleSeriesKey<TTimeframe extends StoredCandleTimeframe = CandleTimeframe> = {
  readonly exchange: string;
  readonly symbol: string;
  readonly timeframe: TTimeframe;
};

// Intervalo semi-aberto em milissegundos: `from` incluído, `to` excluído.
export type FindCandlesParams<TTimeframe extends StoredCandleTimeframe = CandleTimeframe> =
  CandleSeriesKey<TTimeframe> & {
    readonly from: number;
    readonly to: number;
    // Teto de linhas (leitura do primeiro candle, páginas); ausente = o intervalo inteiro.
    readonly limit?: number | undefined;
  };

export type FindMissingOpenTimesParams<TTimeframe extends StoredCandleTimeframe = CandleTimeframe> =
  CandleSeriesKey<TTimeframe> & {
    readonly from: number;
    readonly to: number;
  };

export type UpsertCandlesResult = { readonly inserted: number };

export type CandleRepositoryOptions = { readonly now?: () => number };

export type PurgeDisplayCandlesParams = {
  // Abertura estritamente anterior a este instante é apagada.
  readonly openedBefore: number;
  readonly batchSize?: number | undefined;
  // Padrão: todas as velas de exibição; cada uma tem a sua retenção.
  readonly timeframes?: readonly DisplayCandleTimeframe[] | undefined;
};

export type CandleRepository = {
  readonly upsertCandles: (
    candles: readonly CandleRecord<StoredCandleTimeframe>[],
  ) => Promise<UpsertCandlesResult>;
  readonly findCandles: <TTimeframe extends StoredCandleTimeframe>(
    params: FindCandlesParams<TTimeframe>,
  ) => Promise<readonly CandleRecord<TTimeframe>[]>;
  readonly findMissingOpenTimes: <TTimeframe extends StoredCandleTimeframe>(
    params: FindMissingOpenTimesParams<TTimeframe>,
  ) => Promise<readonly number[]>;
  readonly findLatestOpenTime: <TTimeframe extends StoredCandleTimeframe>(
    key: CandleSeriesKey<TTimeframe>,
  ) => Promise<number | undefined>;
  // Só velas de exibição vencidas; velas de execução nunca entram (spec 017, T2.3).
  readonly purgeDisplayCandles: (params: PurgeDisplayCandlesParams) => Promise<number>;
};
