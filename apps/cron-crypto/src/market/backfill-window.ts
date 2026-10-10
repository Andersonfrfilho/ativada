// Copyright (c) 2026 Ada Technology. All rights reserved.
import { TIMEFRAME_DURATION_MILLISECONDS, type Timeframe } from '@crypto/market-data';

export type BackfillWindow = {
  readonly from: number;
  readonly to: number;
};

export type ComputeBackfillWindowParams = {
  readonly now: number;
  readonly years: number;
  readonly timeframe: Timeframe;
};

// [from, to) na grade do timeframe; `to` é a abertura do candle ainda em formação, que não entra.
export function computeBackfillWindow(params: ComputeBackfillWindowParams): BackfillWindow {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  const start = new Date(params.now);
  start.setUTCFullYear(start.getUTCFullYear() - params.years);
  return {
    from: Math.ceil(start.getTime() / duration) * duration,
    to: Math.floor(params.now / duration) * duration,
  };
}
