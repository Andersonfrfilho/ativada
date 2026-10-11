// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useContext, useSyncExternalStore } from 'react';

import { LiveMarketContext } from './live-market-context.js';
import { computeMarketState, type LivePrice, type MarketStatus } from './market-store.js';
import type { StreamStatus } from './stream.constant.js';

export type LiveMarket = MarketStatus & {
  readonly prices: ReadonlyMap<string, LivePrice>;
  readonly streamStatus: StreamStatus;
  readonly isLive: boolean;
};

export function useLiveMarket(): LiveMarket {
  const value = useContext(LiveMarketContext);
  if (value === undefined) throw new Error('LiveMarketProvider não envolve esta árvore.');
  const prices = useSyncExternalStore(value.store.subscribe, value.store.getSnapshot);
  const status = computeMarketState({ streamStatus: value.streamStatus, prices, now: value.now });
  return { ...status, prices, streamStatus: value.streamStatus, isLive: status.state === 'live' };
}
