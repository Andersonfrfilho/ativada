// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MarketDataClientSettings } from './market-data.types.js';

// `date` é AAAA-MM-DD em UTC.
export type FearGreedPoint = {
  readonly date: string;
  readonly value: number;
  readonly classification: string;
};

// `limit` 0 pede todo o histórico.
export type FetchFearGreedParams = {
  readonly limit: number;
};

export type FearGreedClientSettings = Pick<
  MarketDataClientSettings,
  | 'baseUrl'
  | 'fetchImplementation'
  | 'sleep'
  | 'maxAttempts'
  | 'requestTimeoutMilliseconds'
  | 'backoffBaseMilliseconds'
  | 'backoffMaxMilliseconds'
>;

export type FearGreedClient = {
  readonly fetchFearGreed: (params: FetchFearGreedParams) => Promise<readonly FearGreedPoint[]>;
};
