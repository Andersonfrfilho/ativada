// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  MARKET_CANDLE_DURATION_MILLISECONDS,
  type MarketCandleTimeframe,
} from '@ativada/market-data-crypto';

import { MILLISECONDS_PER_DAY } from './market.constant.js';

export type BackfillWindow = {
  readonly from: number;
  readonly to: number;
};

export type ComputeBackfillWindowParams = {
  readonly now: number;
  // Janela em anos (velas de execução) ou em dias (velas de exibição, retenção curta); um dos dois.
  readonly years?: number | undefined;
  readonly days?: number | undefined;
  readonly timeframe: MarketCandleTimeframe;
};

function computeWindowStart(params: ComputeBackfillWindowParams): number {
  if (params.days !== undefined) return params.now - params.days * MILLISECONDS_PER_DAY;
  const start = new Date(params.now);
  start.setUTCFullYear(start.getUTCFullYear() - (params.years ?? 0));
  return start.getTime();
}

// [from, to) na grade do timeframe; `to` é a abertura do candle ainda em formação, que não entra.
export function computeBackfillWindow(params: ComputeBackfillWindowParams): BackfillWindow {
  const duration = MARKET_CANDLE_DURATION_MILLISECONDS[params.timeframe];
  return {
    from: Math.ceil(computeWindowStart(params) / duration) * duration,
    to: Math.floor(params.now / duration) * duration,
  };
}
