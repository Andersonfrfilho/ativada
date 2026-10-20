// Copyright (c) 2026 Ada Technology. All rights reserved.

export const TIMEFRAME = {
  FIFTEEN_MINUTES: '15m',
  ONE_HOUR: '1h',
  FOUR_HOURS: '4h',
  ONE_DAY: '1d',
} as const;

export type Timeframe = (typeof TIMEFRAME)[keyof typeof TIMEFRAME];

const MILLISECONDS_PER_MINUTE = 60_000;

export const TIMEFRAME_DURATION_MILLISECONDS: Readonly<Record<Timeframe, number>> = {
  [TIMEFRAME.FIFTEEN_MINUTES]: 15 * MILLISECONDS_PER_MINUTE,
  [TIMEFRAME.ONE_HOUR]: 60 * MILLISECONDS_PER_MINUTE,
  [TIMEFRAME.FOUR_HOURS]: 240 * MILLISECONDS_PER_MINUTE,
  [TIMEFRAME.ONE_DAY]: 1_440 * MILLISECONDS_PER_MINUTE,
};

// Velas só de exibição (spec 017): gravadas com retenção curta e NUNCA timeframe de execução; fora de `TIMEFRAME` de propósito.
export const DISPLAY_TIMEFRAME = {
  ONE_MINUTE: '1m',
  THREE_MINUTES: '3m',
} as const;

export type DisplayTimeframe = (typeof DISPLAY_TIMEFRAME)[keyof typeof DISPLAY_TIMEFRAME];

export const MARKET_CANDLE_TIMEFRAME = { ...TIMEFRAME, ...DISPLAY_TIMEFRAME } as const;

export type MarketCandleTimeframe =
  (typeof MARKET_CANDLE_TIMEFRAME)[keyof typeof MARKET_CANDLE_TIMEFRAME];

export const MARKET_CANDLE_DURATION_MILLISECONDS: Readonly<Record<MarketCandleTimeframe, number>> =
  {
    ...TIMEFRAME_DURATION_MILLISECONDS,
    [DISPLAY_TIMEFRAME.ONE_MINUTE]: MILLISECONDS_PER_MINUTE,
    [DISPLAY_TIMEFRAME.THREE_MINUTES]: 3 * MILLISECONDS_PER_MINUTE,
  };

const DISPLAY_TIMEFRAMES: readonly string[] = Object.values(DISPLAY_TIMEFRAME);

export function isDisplayTimeframe(value: string): value is DisplayTimeframe {
  return DISPLAY_TIMEFRAMES.includes(value);
}
