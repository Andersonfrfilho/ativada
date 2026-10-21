// Copyright (c) 2026 Ada Technology. All rights reserved.

// 2026-10-15T06:00:00Z: 03:00 em America/Sao_Paulo e 02:00 em America/New_York.
export const HOUR_MILLISECONDS = 3_600_000;
export const FIRST_CANDLE_TIME = Date.UTC(2026, 9, 15, 6, 0, 0);

export function buildMarketCandle(
  index: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const openTime = FIRST_CANDLE_TIME + index * HOUR_MILLISECONDS;
  return {
    openTime,
    closeTime: openTime + HOUR_MILLISECONDS - 1,
    open: '12.93000000',
    high: '12.98500000',
    low: '12.87200000',
    close: '12.90500000',
    volume: '23900.50000000',
    tradeCount: 120,
    ...overrides,
  };
}

export function buildLayersResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const candleTimes = [0, 1, 2].map((index) => FIRST_CANDLE_TIME + index * HOUR_MILLISECONDS);
  return {
    version: 'layers-1',
    timeframe: '1h',
    from: candleTimes[0],
    to: FIRST_CANDLE_TIME + 3 * HOUR_MILLISECONDS,
    candleTimes,
    score: ['0', '1', '-1.5'],
    actions: ['HOLD', 'HOLD', 'SELL'],
    atr: ['0.12700000', '0.12800000', null],
    lines: [
      {
        key: 'rule:donchian.upper',
        ruleId: 'donchian',
        role: 'channel_upper',
        label: 'Canal Donchian (20 velas): topo',
        values: ['13.1', null, '13.2'],
      },
    ],
    thresholds: [
      {
        from: candleTimes[0],
        to: FIRST_CANDLE_TIME + 3 * HOUR_MILLISECONDS,
        buy: '2',
        sell: '-2',
      },
    ],
    ...overrides,
  };
}

export function buildProjectionsSummary(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    counted: 346,
    hits: 171,
    misses: 175,
    ties: 0,
    noSide: 4,
    pending: 1,
    upMoves: 175,
    banded: 350,
    inside: 318,
    hitRate: '0.4942',
    upRate: '0.5058',
    insideRate: '0.9085',
    byStrength: [{ strength: 'weak', counted: 200, hits: 98, hitRate: '0.4900' }],
    wilson: { lower: '0.4420', upper: '0.5467' },
    verdict: 'even',
    message: 'Acertou o lado em 49,42% (171 de 346).',
    verdictMessage: 'Até aqui, a tendência acertou o lado tanto quanto uma moeda ao ar.',
    ...overrides,
  };
}

export function buildProjectionItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    candleTime: FIRST_CANDLE_TIME,
    closedAt: FIRST_CANDLE_TIME + HOUR_MILLISECONDS,
    side: 'buy',
    strength: 'weak',
    score: '1',
    base: '12.90500000',
    bandLow: '12.77800000',
    bandHigh: '13.03200000',
    nextClose: null,
    moveRate: null,
    result: 'pending',
    isInside: null,
    ...overrides,
  };
}

export function buildProjectionsResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 'projection-1',
    timeframe: '1h',
    current: {
      status: 'available',
      candleTime: FIRST_CANDLE_TIME,
      closedAt: FIRST_CANDLE_TIME + HOUR_MILLISECONDS,
      horizonEndsAt: FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS,
      side: 'buy',
      stance: 'buy',
      strength: 'weak',
      score: '1',
      threshold: '2',
      base: '12.90500000',
      bandLow: '12.77800000',
      bandHigh: '13.03200000',
      atr: '0.12700000',
      label: 'Tende a COMPRAR · fraco',
      message: 'Placar +1 de +2 para comprar.',
    },
    summary: buildProjectionsSummary(),
    items: [buildProjectionItem()],
    nextCursor: null,
    ...overrides,
  };
}

export function buildStreamCandle(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'candle',
    symbol: 'LINKUSDT',
    timeframe: '1h',
    openTime: FIRST_CANDLE_TIME,
    open: '12.93',
    high: '12.985',
    low: '12.872',
    close: '12.905',
    volume: '23900.5',
    closed: false,
    at: FIRST_CANDLE_TIME + 1_000,
    ...overrides,
  };
}
