// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useContext, useSyncExternalStore } from 'react';

import { LiveMarketContext } from './live-market-context.js';
import {
  computeMarketState,
  isPriceFresh,
  type LivePrice,
  type MarketStatus,
} from './market-store.js';
import type { StreamStatus } from './stream.constant.js';

export type LiveMarket = MarketStatus & {
  readonly prices: ReadonlyMap<string, LivePrice>;
  readonly streamStatus: StreamStatus;
  readonly isLive: boolean;
  readonly now: number;
  // O tick do par só quando o socket está vivo e o par chegou dentro da janela (e sem o selo do servidor).
  readonly freshPrice: (symbol: string) => LivePrice | undefined;
};

export function useLiveMarket(): LiveMarket {
  const value = useContext(LiveMarketContext);
  if (value === undefined) throw new Error('LiveMarketProvider não envolve esta árvore.');
  const prices = useSyncExternalStore(value.store.subscribe, value.store.getSnapshot);
  const { streamStatus, now, silenceMilliseconds } = value;
  const status = computeMarketState({ streamStatus, prices, now, silenceMilliseconds });
  const isLive = status.state === 'live';
  return {
    ...status,
    prices,
    streamStatus,
    isLive,
    now,
    freshPrice: (symbol): LivePrice | undefined => {
      const price = prices.get(symbol);
      if (!isLive || price === undefined) return undefined;
      return isPriceFresh({ price, now, silenceMilliseconds }) ? price : undefined;
    },
  };
}
