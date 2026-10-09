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
