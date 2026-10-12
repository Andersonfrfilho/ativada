// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRecord, CandleRepository } from '@ativada/database';

import type { CandlesQuery } from './candles-query.schema.js';

// Vela devolvida ao painel: preços e volume são texto decimal exato, os instantes são milissegundos.
export type CandleView = {
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
  readonly tradeCount: number;
};

export type ListCandlesUseCase = (query: CandlesQuery) => Promise<readonly CandleView[]>;

export type ListCandlesDependencies = {
  readonly candles: Pick<CandleRepository, 'findCandles'>;
  readonly exchange: string;
};

export function toCandleView(record: CandleRecord): CandleView {
  return {
    openTime: record.openTime,
    closeTime: record.closeTime,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volume: record.volume,
    tradeCount: record.tradeCount,
  };
}

// Candle é dado público de mercado (sem dono): a leitura não leva escopo.
export function createListCandlesUseCase(
  dependencies: ListCandlesDependencies,
): ListCandlesUseCase {
  return async (query) => {
    const records = await dependencies.candles.findCandles({
      exchange: dependencies.exchange,
      symbol: query.symbol,
      timeframe: query.timeframe,
      from: query.from,
      to: query.to,
    });
    return records.map(toCandleView);
  };
}
