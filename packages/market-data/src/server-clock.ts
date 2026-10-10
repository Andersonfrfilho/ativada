// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import {
  BINANCE_MARKET_DATA_BASE_URL,
  BINANCE_SOURCE_NAME,
  DEFAULT_SERVER_CLOCK_REFRESH_MILLISECONDS,
  SERVER_TIME_PATH,
  SERVER_TIME_TIMEOUT_MILLISECONDS,
} from './market-data.constant.js';
import { MarketDataHttpError, MarketDataResponseError } from './market-data.error.js';
import type { FetchImplementation } from './market-data.types.js';

const serverTimeSchema = z.object({ serverTime: z.number().int().nonnegative() });

export type ServerClockWarning = { readonly errorName: string };

export type ServerClockSettings = {
  readonly baseUrl?: string | undefined;
  readonly fetchImplementation?: FetchImplementation | undefined;
  readonly now?: (() => number) | undefined;
  readonly refreshIntervalMilliseconds?: number | undefined;
  readonly onWarning?: ((warning: ServerClockWarning) => void) | undefined;
};

export type ServerClock = {
  readonly now: () => number;
  // Lê a hora do servidor sempre; use no início de cada execução.
  readonly refresh: () => Promise<void>;
  // Lê só se a última tentativa (mesmo falha) passou do intervalo.
  readonly refreshIfStale: () => Promise<void>;
};

async function readServerTime(
  url: string,
  fetchImplementation: FetchImplementation,
): Promise<number> {
  const response = await fetchImplementation(url, {
    signal: AbortSignal.timeout(SERVER_TIME_TIMEOUT_MILLISECONDS),
  });
  if (!response.ok) {
    throw new MarketDataHttpError({
      status: response.status,
      attempts: 1,
      sourceName: BINANCE_SOURCE_NAME,
    });
  }
  const parsed = serverTimeSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new MarketDataResponseError('Resposta de /api/v3/time fora do formato esperado.');
  }
  return parsed.data.serverTime;
}

export function createServerClock(settings: ServerClockSettings = {}): ServerClock {
  const localNow = settings.now ?? Date.now;
  const fetchImplementation =
    settings.fetchImplementation ?? ((url, init): Promise<Response> => fetch(url, init));
  const refreshInterval =
    settings.refreshIntervalMilliseconds ?? DEFAULT_SERVER_CLOCK_REFRESH_MILLISECONDS;
  const url = new URL(
    SERVER_TIME_PATH,
    settings.baseUrl ?? BINANCE_MARKET_DATA_BASE_URL,
  ).toString();
  let offset = 0;
  let lastAttemptAt: number | undefined;
  let inFlight: Promise<void> | undefined;

  async function measure(): Promise<void> {
    const sentAt = localNow();
    lastAttemptAt = sentAt;
    try {
      const serverTime = await readServerTime(url, fetchImplementation);
      offset = serverTime - (sentAt + localNow()) / 2;
    } catch (error: unknown) {
      settings.onWarning?.({ errorName: error instanceof Error ? error.name : 'UnknownError' });
    }
  }

  function refresh(): Promise<void> {
    inFlight ??= measure().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  return {
    now: (): number => Math.round(localNow() + offset),
    refresh,
    refreshIfStale: (): Promise<void> => {
      const isFresh = lastAttemptAt !== undefined && localNow() - lastAttemptAt < refreshInterval;
      return isFresh ? (inFlight ?? Promise.resolve()) : refresh();
    },
  };
}
