// Copyright (c) 2026 Ada Technology. All rights reserved.
// Copyright (c) 2026 Ada Technology. All rights reserved.
import { BINANCE_MARKET_DATA_BASE_URL, DEFAULT_CLIENT_SETTINGS } from './market-data.constant.js';
import type { MarketDataClientSettings, ResolvedMarketDataSettings } from './market-data.types.js';

// Acorda no abort: quem esperou checa o sinal depois e decide parar.
function buildAbortableSleep(
  signal: AbortSignal | undefined,
): (milliseconds: number) => Promise<void> {
  return (milliseconds) =>
    new Promise((resolve) => {
      if (signal?.aborted === true) return resolve();
      const wake = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', wake);
        resolve();
      };
      const timer = setTimeout(wake, milliseconds);
      signal?.addEventListener('abort', wake, { once: true });
    });
}

export function resolveSettings(settings: MarketDataClientSettings): ResolvedMarketDataSettings {
  return {
    baseUrl: settings.baseUrl ?? BINANCE_MARKET_DATA_BASE_URL,
    fetchImplementation:
      settings.fetchImplementation ?? ((url, init): Promise<Response> => fetch(url, init)),
    now: settings.clock?.now ?? settings.now ?? Date.now,
    ...(settings.clock === undefined ? {} : { clock: settings.clock }),
    sleep: settings.sleep ?? buildAbortableSleep(settings.signal),
    ...(settings.signal === undefined ? {} : { signal: settings.signal }),
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
