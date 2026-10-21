// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DISPLAY_TIMEFRAME, type DisplayTimeframe } from './timeframe.constant.js';

export type DisplayRetentionSettings = {
  readonly CANDLE_DISPLAY_RETENTION_DAYS: number;
  readonly CANDLE_DISPLAY_1M_RETENTION_DAYS: number;
};

export type DisplayRetentionDays = Readonly<Record<DisplayTimeframe, number>>;

// Retenção por vela de exibição: a de 1 min tem a sua própria.
export function buildDisplayRetentionDays(
  settings: DisplayRetentionSettings,
): DisplayRetentionDays {
  return {
    [DISPLAY_TIMEFRAME.ONE_MINUTE]: settings.CANDLE_DISPLAY_1M_RETENTION_DAYS,
    [DISPLAY_TIMEFRAME.THREE_MINUTES]: settings.CANDLE_DISPLAY_RETENTION_DAYS,
  };
}
