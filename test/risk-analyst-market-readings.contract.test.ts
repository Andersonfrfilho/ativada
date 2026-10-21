// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const {
  ANALYST_RULES,
  CANDLE_MILLISECONDS,
  collectAtrRates,
  computeAtrPercentiles,
  computeAtrRate,
  computeMarketReadings,
  computeMomentum,
  computeMoveToCost,
  computeRelativeVolume,
  computeRoundTripCost,
  locateCandle,
} = await loadRiskAnalystApi();

type Candle = { openTime: number; close: string; volume: string };
type Reading = {
  openTime: number;
  close: string;
  vote: -1 | 0 | 1 | null;
  isMissing: boolean;
  atr: string | null;
};

const D = CANDLE_MILLISECONDS;
const START = 10_000 * D;

function candlesOf(volumes: readonly string[], closes?: readonly string[]): Candle[] {
  return volumes.map((volume, index) => ({
    openTime: START + index * D,
    close: closes?.[index] ?? '100',
    volume,
  }));
}

function repeat<TValue>(value: TValue, count: number): TValue[] {
  return Array.from({ length: count }, () => value);
}

function readingsOf(atrs: readonly (string | null)[], firstIndex = 0): Reading[] {
  return atrs.map((atr, index) => ({
    openTime: START + (firstIndex + index) * D,
    close: '1',
    vote: 0,
    isMissing: false,
    atr,
  }));
}

function ascendingAtrs(count: number): string[] {
  return Array.from(
    { length: count },
    (_unused, index) => `0.${String(index + 1).padStart(3, '0')}`,
  );
}

describe('localizar a vela', () => {
  const candles = candlesOf(repeat('1', 10));
  test('acha por abertura (busca binária) e devolve -1 quando não existe', () => {
    expect(locateCandle(candles, START)).toBe(0);
    expect(locateCandle(candles, START + 9 * D)).toBe(9);
    expect(locateCandle(candles, START + 4 * D)).toBe(4);
    expect(locateCandle(candles, START - D)).toBe(-1);
    expect(locateCandle(candles, START + 10 * D)).toBe(-1);
    expect(locateCandle(candles, START + 1)).toBe(-1);
    expect(locateCandle([], START)).toBe(-1);
  });
});

describe('volume relativo (A8)', () => {
  test('25 numa média de 10 das 96 anteriores é 2,5× (a vela atual NÃO entra na média)', () => {
    const candles = candlesOf([...repeat('10', 96), '25']);
    expect(computeRelativeVolume({ candles, candleTime: START + 96 * D })).toBe('2.5');
  });

  test('a média usa exatamente as 96 anteriores, não as mais antigas', () => {
    const candles = candlesOf(['9999', ...repeat('10', 96), '5']);
    expect(computeRelativeVolume({ candles, candleTime: START + 97 * D })).toBe('0.5');
  });

  test('divisão a 12 casas para baixo: 1 numa média de 3 é 0,333333333333', () => {
    const candles = candlesOf([...repeat('3', 96), '1']);
    expect(computeRelativeVolume({ candles, candleTime: START + 96 * D })).toBe('0.333333333333');
  });

  test('soma de volume zero é mercado parado: "0", sem dividir por zero', () => {
    const candles = candlesOf([...repeat('0', 96), '7']);
    expect(computeRelativeVolume({ candles, candleTime: START + 96 * D })).toBe('0');
  });

  test('falta uma vela na janela de 24 h ou menos de 96 anteriores é null', () => {
    const complete = candlesOf([...repeat('10', 96), '25']);
    const withHole = complete.filter((_candle, index) => index !== 40);
    expect(computeRelativeVolume({ candles: withHole, candleTime: START + 96 * D })).toBeNull();
    expect(
      computeRelativeVolume({ candles: complete.slice(1), candleTime: START + 96 * D }),
    ).toBeNull();
    expect(computeRelativeVolume({ candles: complete, candleTime: START + 5 * D })).toBeNull();
    expect(computeRelativeVolume({ candles: complete, candleTime: START + 500 * D })).toBeNull();
  });

  test('velas depois de t não mudam a leitura (sem lookahead)', () => {
    const full = candlesOf([...repeat('10', 96), '25', '1000', '1000']);
    const candleTime = START + 96 * D;
    expect(computeRelativeVolume({ candles: full, candleTime })).toBe(
      computeRelativeVolume({ candles: full.slice(0, 97), candleTime }),
    );
  });
});

describe('momentum (A8)', () => {
  const closes = ['100', '100', '100', '100', '110', '90', '100'];

  test('retorno de k velas: 110 sobre 100 é +0,1 e 90 sobre 100 é -0,1', () => {
    const candles = candlesOf(repeat('1', closes.length), closes);
    const short = ANALYST_RULES.momentumShortCandles;
    expect(computeMomentum({ candles, candleTime: START + 4 * D, lookbackCandles: short })).toBe(
      '0.1',
    );
    expect(computeMomentum({ candles, candleTime: START + 5 * D, lookbackCandles: 4 })).toBe(
      '-0.1',
    );
  });

  test('negativo arredonda para baixo (o mais negativo): 2 sobre 3 é -0,333333333334', () => {
    const candles = candlesOf(['1', '1'], ['3', '2']);
    expect(computeMomentum({ candles, candleTime: START + D, lookbackCandles: 1 })).toBe(
      '-0.333333333334',
    );
  });

  test('sem a vela de k atrás é null', () => {
    const candles = candlesOf(repeat('1', 3), ['1', '2', '3']);
    expect(computeMomentum({ candles, candleTime: START + 2 * D, lookbackCandles: 4 })).toBeNull();
    expect(computeMomentum({ candles, candleTime: START + 9 * D, lookbackCandles: 1 })).toBeNull();
  });
});

describe('ATR em % do preço e percentis nearest-rank (A8)', () => {
  test('atrRate = ATR ÷ fechamento a 12 casas para baixo', () => {
    expect(computeAtrRate({ atr: '1', close: '3' })).toBe('0.333333333333');
    expect(computeAtrRate({ atr: '2', close: '100' })).toBe('0.02');
    expect(computeAtrRate({ atr: '1', close: '0' })).toBeNull();
  });

  test('100 amostras de 0,001 a 0,1: o percentil 90 é a 90ª e o 95 é a 95ª', () => {
    const series = readingsOf(ascendingAtrs(100));
    const { rates } = collectAtrRates({ series, candleTime: START + 99 * D });
    expect(computeAtrPercentiles(rates)).toStrictEqual({ p90: '0.09', p95: '0.095' });
  });

  test('96 amostras: posições ⌈86,4⌉ = 87 e ⌈91,2⌉ = 92 (sem interpolar)', () => {
    const series = readingsOf(ascendingAtrs(96));
    const { rates } = collectAtrRates({ series, candleTime: START + 95 * D });
    expect(computeAtrPercentiles(rates)).toStrictEqual({ p90: '0.087', p95: '0.092' });
  });

  test('a ordem de entrada não muda o percentil', () => {
    const ascending = collectAtrRates({
      series: readingsOf(ascendingAtrs(100)),
      candleTime: START + 99 * D,
    });
    const descending = collectAtrRates({
      series: readingsOf(ascendingAtrs(100).reverse()),
      candleTime: START + 99 * D,
    });
    expect(computeAtrPercentiles(descending.rates)).toStrictEqual(
      computeAtrPercentiles(ascending.rates),
    );
  });

  test('abaixo de 96 amostras não há percentil (aquecendo)', () => {
    const series = readingsOf(repeat('0.01', 95));
    const { rates } = collectAtrRates({ series, candleTime: START + 94 * D });
    expect(rates).toHaveLength(95);
    expect(computeAtrPercentiles(rates)).toStrictEqual({ p90: null, p95: null });
  });

  test('a janela é (t − 2.880·d, t]: a vela da borda de baixo sai, a de t entra, a de t + d fica de fora', () => {
    const series = readingsOf(repeat('0.01', 2883));
    const { rates, current } = collectAtrRates({ series, candleTime: START + 2880 * D });
    expect(rates).toHaveLength(ANALYST_RULES.percentileWindowCandles);
    expect(current).toBe('0.01');
  });

  test('vela sem ATR não conta e o atrRate atual é null quando t não tem leitura', () => {
    const series = readingsOf([...repeat<string | null>('0.01', 10), null]);
    const { rates, current } = collectAtrRates({ series, candleTime: START + 10 * D });
    expect(rates).toHaveLength(10);
    expect(current).toBeNull();
  });
});

describe('custo de ida e volta e razão movimento ÷ custo (A8)', () => {
  test('2 × (0,001 + 0,0005) = 0,003 exato', () => {
    expect(computeRoundTripCost({ feeRate: '0.001', slippageRate: '0.0005' })).toBe('0.003');
    expect(computeRoundTripCost({ feeRate: '0', slippageRate: '0' })).toBe('0');
  });

  test('razão a 12 casas para baixo; custo zero ou ATR ausente é null', () => {
    expect(computeMoveToCost({ atrRate: '0.006', roundTripCost: '0.003' })).toBe('2');
    expect(computeMoveToCost({ atrRate: '0.0059', roundTripCost: '0.003' })).toBe('1.966666666666');
    expect(computeMoveToCost({ atrRate: '0.006', roundTripCost: '0' })).toBeNull();
    expect(computeMoveToCost({ atrRate: null, roundTripCost: '0.003' })).toBeNull();
  });
});

describe('leituras compostas', () => {
  const runCost = { feeRate: '0.001', slippageRate: '0.0005' };
  const total = 130;
  const closes = Array.from({ length: total }, (_unused, index) => String(100 + index));
  const volumes = Array.from({ length: total }, (_unused, index) =>
    index === total - 1 ? '30' : '10',
  );
  const candles = candlesOf(volumes, closes);
  const series = readingsOf(repeat('0.5', total)).map((reading, index) => ({
    ...reading,
    close: String(100 + index),
  }));
  const candleTime = START + (total - 1) * D;

  test('junta volume, ATR, percentis, momentum, custo e razão da vela t (contas à mão)', () => {
    // volume 30 ÷ média 10 = 3; atr 0,5 ÷ 229; percentis = 0,5 ÷ (229 − 116) e 0,5 ÷ (229 − 123); 4 ÷ 225; 16 ÷ 213.
    expect(computeMarketReadings({ candles, series, candleTime, runCost })).toStrictEqual({
      relativeVolume: '3',
      atrRate: '0.002183406113',
      atrPercentile90: '0.004424778761',
      atrPercentile95: '0.004716981132',
      momentumShort: '0.017777777777',
      momentumLong: '0.075117370892',
      roundTripCost: '0.003',
      moveToCost: '0.727802037666',
    });
  });

  test('cortar a série no fim de t dá exatamente a mesma leitura', () => {
    const extended = candlesOf([...volumes, '9999', '9999'], [...closes, '1', '1']);
    const extendedSeries = [
      ...series,
      ...readingsOf(['9', '9'], total).map((reading) => ({ ...reading, close: '1' })),
    ];
    expect(
      computeMarketReadings({ candles: extended, series: extendedSeries, candleTime, runCost }),
    ).toStrictEqual(computeMarketReadings({ candles, series, candleTime, runCost }));
  });
});
