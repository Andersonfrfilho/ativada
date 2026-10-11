// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext } from 'react';

import type { MarketStore } from './market-store.js';
import type { StreamStatus } from './stream.constant.js';

export type LiveMarketValue = {
  readonly store: MarketStore;
  readonly streamStatus: StreamStatus;
  readonly now: number;
};

export const LiveMarketContext = createContext<LiveMarketValue | undefined>(undefined);
