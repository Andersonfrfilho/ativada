// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { marketCandleSchema } from '../src/runs/candle-chart/market-candles.validation.js';
import {
  buildOhlcText,
  describeCandleForSpeech,
  type OhlcInput,
} from '../src/runs/candle-chart/ohlc-text.js';
import { buildMarketCandle } from './support/candle-chart-fixtures.js';

const SAO_PAULO = 'America/Sao_Paulo';
const NEW_YORK = 'America/New_York';

function inputOf(
  overrides: Partial<OhlcInput> = {},
  candle: Record<string, unknown> = {},
): OhlcInput {
  return {
    candle: marketCandleSchema.parse(buildMarketCandle(0, candle)),
    previousClose: '12.93000000',
    symbol: 'LINKUSDT',
    timeframe: '1h',
    timeZone: SAO_PAULO,
    isForming: false,
    ...overrides,
  };
}

describe('OHLC legend', () => {
  test('shows the recorded values with the same number of decimals, the variation and the volume', () => {
    const text = buildOhlcText(inputOf());
    expect(text).toStrictEqual({
      title: 'LINKUSDT · 1h · 15/10/2026 03:00',
      open: '12,930',
      high: '12,985',
      low: '12,872',
      close: '12,905',
      change: '-0,20%',
      direction: 'down',
      volume: '23,9 mil',
      isForming: false,
    });
  });

  test('the time follows the user time zone: Sao Paulo and New York', () => {
    expect(buildOhlcText(inputOf()).title).toBe('LINKUSDT · 1h · 15/10/2026 03:00');
    expect(buildOhlcText(inputOf({ timeZone: NEW_YORK })).title).toBe(
      'LINKUSDT · 1h · 15/10/2026 02:00',
    );
  });

  test('the date changes with the zone at the day boundary', () => {
    const lateNight = {
      openTime: Date.UTC(2026, 9, 15, 1, 0),
      closeTime: Date.UTC(2026, 9, 15, 1, 59),
    };
    expect(buildOhlcText(inputOf({}, lateNight)).title).toContain('14/10/2026 22:00');
    expect(buildOhlcText(inputOf({ timeZone: NEW_YORK }, lateNight)).title).toContain(
      '14/10/2026 21:00',
    );
  });

  test('the variation is exact and rounds down, with the direction taken from what is shown', () => {
    const up = buildOhlcText(inputOf({ previousClose: '12.80000000' }));
    expect([up.change, up.direction]).toStrictEqual(['+0,82%', 'up']);
    const flat = buildOhlcText(inputOf({ previousClose: '12.90500000' }));
    expect([flat.change, flat.direction]).toStrictEqual(['0,00%', 'flat']);
    const tinyRise = buildOhlcText(inputOf({ previousClose: '12.90499999' }));
    expect([tinyRise.change, tinyRise.direction]).toStrictEqual(['0,00%', 'flat']);
  });

  test('no previous close, no variation', () => {
    const text = buildOhlcText(inputOf({ previousClose: undefined }));
    expect([text.change, text.direction]).toStrictEqual([undefined, undefined]);
  });

  test('prices keep at least two decimals and many digits are not rounded away', () => {
    const big = {
      open: '67123.45000000',
      high: '67200.00000000',
      low: '67000.10000000',
      close: '67150.5',
    };
    const text = buildOhlcText(inputOf({ previousClose: undefined }, big));
    expect([text.open, text.high, text.low, text.close]).toStrictEqual([
      '67.123,45',
      '67.200,00',
      '67.000,10',
      '67.150,50',
    ]);
    const tiny = { open: '0.00001234', high: '0.00001300', low: '0.00001200', close: '0.00001250' };
    expect(buildOhlcText(inputOf({ previousClose: undefined }, tiny)).open).toBe('0,00001234');
  });

  test('the volume is compact in pt-BR and rounds down', () => {
    const volumeOf = (volume: string): string => buildOhlcText(inputOf({}, { volume })).volume;
    expect(volumeOf('0')).toBe('0');
    expect(volumeOf('999.999')).toBe('999,99');
    expect(volumeOf('1500')).toBe('1,5 mil');
    expect(volumeOf('1999.99')).toBe('1,9 mil');
    expect(volumeOf('2500000')).toBe('2,5 mi');
    expect(volumeOf('3200000000')).toBe('3,2 bi');
  });

  test('a forming candle is flagged', () => {
    expect(buildOhlcText(inputOf({ isForming: true })).isForming).toBe(true);
  });
});

describe('spoken candle description', () => {
  const spoken = (overrides: Partial<OhlcInput>, eventLabel?: string): string =>
    describeCandleForSpeech({ ...inputOf(overrides), eventLabel });

  test('reads the day and time in the zone, the four prices, the variation and the event', () => {
    expect(spoken({}, 'compra')).toBe(
      '15/10 às 03:00: abertura 12,930, máxima 12,985, mínima 12,872, fechamento 12,905, variação -0,20%; compra',
    );
    expect(spoken({ timeZone: NEW_YORK }, 'venda')).toContain('15/10 às 02:00:');
  });

  test('says "vela em formação" and omits what is not known', () => {
    expect(spoken({ isForming: true, previousClose: undefined })).toBe(
      '15/10 às 03:00: abertura 12,930, máxima 12,985, mínima 12,872, fechamento 12,905; vela em formação',
    );
  });
});
