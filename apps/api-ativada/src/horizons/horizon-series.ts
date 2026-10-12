// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toEngineCandle } from '@ativada/run-recording';
import type { EngineCandle } from '@ativada/strategy-engine';

import { latestContiguousRun } from '../goals/goal-evaluation-candles.js';
import {
  buildSymbolSeries,
  setupFor,
  type SeriesReader,
  type SymbolSeries,
} from '../goals/goal-evaluation-series.js';
import {
  HORIZON_DAILY_HISTORY_DAYS,
  HORIZON_DAILY_TIMEFRAME,
  HORIZON_INTRADAY_DAYS,
  HORIZON_INTRADAY_TIMEFRAME,
} from './horizon.constant.js';

const MILLISECONDS_PER_DAY = 86_400_000;

export type HorizonSeriesSet = {
  readonly symbol: string;
  readonly daily: SymbolSeries;
  readonly intraday: SymbolSeries;
};

type FindParams = {
  readonly symbol: string;
  readonly timeframe: typeof HORIZON_DAILY_TIMEFRAME | typeof HORIZON_INTRADAY_TIMEFRAME;
  readonly from: number;
  readonly to: number;
};

async function findCandles(reader: SeriesReader, params: FindParams): Promise<EngineCandle[]> {
  const records = await reader.candles.findCandles({ exchange: reader.exchange, ...params });
  return records.map(toEngineCandle);
}

// Candle é dado público de mercado (sem dono). A série diária é o trecho contíguo mais recente (o motor das janelas
// recusa lacuna); a de 15 minutos vai como está, porque o passo do backtest declara a lacuna ao motor.
export async function loadHorizonSeries(
  reader: SeriesReader,
  params: { readonly symbol: string; readonly now: number },
): Promise<HorizonSeriesSet> {
  const { symbol, now } = params;
  const [daily, intraday] = await Promise.all([
    findCandles(reader, {
      symbol,
      timeframe: HORIZON_DAILY_TIMEFRAME,
      from: now - HORIZON_DAILY_HISTORY_DAYS * MILLISECONDS_PER_DAY,
      to: now,
    }),
    findCandles(reader, {
      symbol,
      timeframe: HORIZON_INTRADAY_TIMEFRAME,
      from: now - HORIZON_INTRADAY_DAYS * MILLISECONDS_PER_DAY,
      to: now,
    }),
  ]);
  return {
    symbol,
    daily: buildSymbolSeries(reader, {
      symbol,
      run: setupFor(symbol, HORIZON_DAILY_TIMEFRAME),
      candles: latestContiguousRun(daily),
    }),
    intraday: buildSymbolSeries(reader, {
      symbol,
      run: setupFor(symbol, HORIZON_INTRADAY_TIMEFRAME),
      candles: intraday,
    }),
  };
}
