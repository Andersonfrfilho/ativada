// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleAggregator,
  TICK_PUBLISH_INTERVAL_MILLISECONDS,
  type RawCandle,
} from '@ativada/market-data-crypto';

import type { MarketContext, MarketPublisherSettings } from './market-context.js';
import { publishCandle } from './market-publishing.js';

export type CandleIntake = {
  readonly handle: (candle: RawCandle) => void;
  readonly close: () => void;
};

// A vela em formação (spec 009, T1.5): no máximo 1 publicação por segundo por (par, vela), só de par configurado.
export function createCandleIntake<TTimer>(
  context: MarketContext,
  settings: MarketPublisherSettings<TTimer>,
): CandleIntake {
  const aggregator = createCandleAggregator<TTimer>({
    intervalMilliseconds: TICK_PUBLISH_INTERVAL_MILLISECONDS,
    setTimer: settings.setTimer,
    clearTimer: settings.clearTimer,
    publish: (candle) => publishCandle(context, candle),
    reportError: settings.reportError,
  });
  return {
    handle: (candle): void => {
      if (context.isClosed || !context.pairs.has(candle.symbol)) return;
      aggregator.push(candle);
    },
    close: aggregator.close,
  };
}
