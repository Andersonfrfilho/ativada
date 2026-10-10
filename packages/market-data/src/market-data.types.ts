// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Candle } from './candle.types.js';
import type { ServerClock } from './server-clock.js';
import type { Timeframe } from './timeframe.constant.js';

export type FetchImplementation = (
  url: string,
  init: { readonly signal: AbortSignal },
) => Promise<Response>;

export type MarketDataClientSettings = {
  readonly baseUrl?: string;
  readonly fetchImplementation?: FetchImplementation;
  readonly now?: () => number;
  // Hora do servidor: quando informado, vale no lugar de `now` para decidir o que já fechou.
  readonly clock?: Pick<ServerClock, 'now' | 'refreshIfStale'>;
  // Cancela a chamada em curso, a espera de Retry-After/backoff e a paginação.
  readonly signal?: AbortSignal;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly weightCeiling?: number;
  readonly weightSafetyMargin?: number;
  readonly maxAttempts?: number;
  readonly requestTimeoutMilliseconds?: number;
  readonly backoffBaseMilliseconds?: number;
  readonly backoffMaxMilliseconds?: number;
};

export type FetchKlinesParams = {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly limit?: number;
};

export type FetchKlinesRangeParams = {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly from: number;
  readonly to: number;
  readonly onPage?: (page: readonly Candle[]) => Promise<void>;
};

export type MarketDataClient = {
  readonly fetchKlines: (params: FetchKlinesParams) => Promise<readonly Candle[]>;
  readonly fetchKlinesRange: (params: FetchKlinesRangeParams) => Promise<readonly Candle[]>;
};

export type ResolvedMarketDataSettings = Required<
  Omit<MarketDataClientSettings, 'clock' | 'signal'>
> &
  Pick<MarketDataClientSettings, 'clock' | 'signal'>;
