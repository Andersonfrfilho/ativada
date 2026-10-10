// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IndicatorCandle } from '../../../../packages/strategy-engine/src/index.js';
import btcusdtHourly from '../market/btcusdt-1h-500.json' with { type: 'json' };
import ethusdtDaily from '../market/ethusdt-1d-400.json' with { type: 'json' };
import { type OracleCandle, toOracleNumber } from './oracle-decimal.fixture.js';

// Formato cru da Binance: [openTime, open, high, low, close, volume, closeTime, …], preços em texto.
type BinanceKline = readonly (string | number)[];

export type MarketSeries = {
  readonly name: string;
  readonly oracleCandles: readonly OracleCandle[];
  readonly indicatorCandles: readonly IndicatorCandle[];
};

export function toOracleCandle(row: BinanceKline): OracleCandle {
  if (row.length < 6) throw new Error('Linha de candle incompleta.');
  const [openTime, open, high, low, close, volume] = row.map((field) => String(field));
  return {
    openTime: Number(openTime),
    open: toOracleNumber(open ?? ''),
    high: toOracleNumber(high ?? ''),
    low: toOracleNumber(low ?? ''),
    close: toOracleNumber(close ?? ''),
    volume: toOracleNumber(volume ?? ''),
  };
}

// O que o indicador recebe é o `number` mais próximo do texto exato: o erro medido inclui a conversão.
export function toIndicatorCandleFromOracle(candle: OracleCandle): IndicatorCandle {
  return {
    openTime: candle.openTime,
    open: candle.open.toNumber(),
    high: candle.high.toNumber(),
    low: candle.low.toNumber(),
    close: candle.close.toNumber(),
    volume: candle.volume.toNumber(),
  };
}

export function buildMarketSeries(
  name: string,
  oracleCandles: readonly OracleCandle[],
): MarketSeries {
  return { name, oracleCandles, indicatorCandles: oracleCandles.map(toIndicatorCandleFromOracle) };
}

export const BTCUSDT_HOURLY_SERIES: MarketSeries = buildMarketSeries(
  'BTCUSDT 1h × 500',
  btcusdtHourly.map(toOracleCandle),
);

export const ETHUSDT_DAILY_SERIES: MarketSeries = buildMarketSeries(
  'ETHUSDT 1d × 400',
  ethusdtDaily.map(toOracleCandle),
);
