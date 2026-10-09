// Copyright (c) 2026 Ada Technology. All rights reserved.
import { BINANCE_MARKET_DATA_BASE_URL, DEFAULT_CLIENT_SETTINGS } from './market-data.constant.js';
import type { MarketDataClientSettings, ResolvedMarketDataSettings } from './market-data.types.js';

export function resolveSettings(settings: MarketDataClientSettings): ResolvedMarketDataSettings {
  return {
    baseUrl: settings.baseUrl ?? BINANCE_MARKET_DATA_BASE_URL,
    fetchImplementation:
      settings.fetchImplementation ?? ((url, init): Promise<Response> => fetch(url, init)),
    now: settings.now ?? Date.now,
    sleep:
      settings.sleep ??
      ((milliseconds): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, milliseconds))),
    weightCeiling: settings.weightCeiling ?? DEFAULT_CLIENT_SETTINGS.weightCeiling,
    weightSafetyMargin: settings.weightSafetyMargin ?? DEFAULT_CLIENT_SETTINGS.weightSafetyMargin,
    maxAttempts: settings.maxAttempts ?? DEFAULT_CLIENT_SETTINGS.maxAttempts,
    requestTimeoutMilliseconds:
      settings.requestTimeoutMilliseconds ?? DEFAULT_CLIENT_SETTINGS.requestTimeoutMilliseconds,
    backoffBaseMilliseconds:
      settings.backoffBaseMilliseconds ?? DEFAULT_CLIENT_SETTINGS.backoffBaseMilliseconds,
    backoffMaxMilliseconds:
      settings.backoffMaxMilliseconds ?? DEFAULT_CLIENT_SETTINGS.backoffMaxMilliseconds,
  };
}
