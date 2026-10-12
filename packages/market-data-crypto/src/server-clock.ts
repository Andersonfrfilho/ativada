// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readErrorName, z } from '@ativada/environment';

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
  readonly signal?: AbortSignal | undefined;
  readonly onWarning?: ((warning: ServerClockWarning) => void) | undefined;
};

export type ServerClock = {
  readonly now: () => number;
  // Lê a hora do servidor sempre; use no início de cada execução.
  readonly refresh: () => Promise<void>;
  // Lê só se a última tentativa (mesmo falha) passou do intervalo.
  readonly refreshIfStale: () => Promise<void>;
};

type ReadServerTimeParams = {
  readonly url: string;
  readonly fetchImplementation: FetchImplementation;
  readonly signal: AbortSignal | undefined;
};

async function readServerTime(params: ReadServerTimeParams): Promise<number> {
  const timeout = AbortSignal.timeout(SERVER_TIME_TIMEOUT_MILLISECONDS);
  const response = await params.fetchImplementation(params.url, {
    signal: params.signal === undefined ? timeout : AbortSignal.any([timeout, params.signal]),
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

type ClockState = {
  offset: number;
  lastAttemptAt: number | undefined;
  inFlight: Promise<void> | undefined;
};

type ClockContext = {
  readonly settings: ServerClockSettings;
  readonly localNow: () => number;
  readonly fetchImplementation: FetchImplementation;
  readonly url: string;
  readonly refreshInterval: number;
  readonly state: ClockState;
};

async function measure(context: ClockContext): Promise<void> {
  const { settings, localNow, fetchImplementation, url, state } = context;
  const sentAt = localNow();
  state.lastAttemptAt = sentAt;
  try {
    const serverTime = await readServerTime({ url, fetchImplementation, signal: settings.signal });
    state.offset = serverTime - (sentAt + localNow()) / 2;
  } catch (error: unknown) {
    if (settings.signal?.aborted === true) return;
    settings.onWarning?.({ errorName: readErrorName(error) });
  }
}

function refresh(context: ClockContext): Promise<void> {
  const { state } = context;
  state.inFlight ??= measure(context).finally(() => {
    state.inFlight = undefined;
  });
  return state.inFlight;
}

function refreshIfStale(context: ClockContext): Promise<void> {
  const { state, localNow, refreshInterval } = context;
  const isFresh =
    state.lastAttemptAt !== undefined && localNow() - state.lastAttemptAt < refreshInterval;
  return isFresh ? (state.inFlight ?? Promise.resolve()) : refresh(context);
}

export function createServerClock(settings: ServerClockSettings = {}): ServerClock {
  const context: ClockContext = {
    settings,
    localNow: settings.now ?? Date.now,
    fetchImplementation:
      settings.fetchImplementation ?? ((url, init): Promise<Response> => fetch(url, init)),
    refreshInterval:
      settings.refreshIntervalMilliseconds ?? DEFAULT_SERVER_CLOCK_REFRESH_MILLISECONDS,
    url: new URL(SERVER_TIME_PATH, settings.baseUrl ?? BINANCE_MARKET_DATA_BASE_URL).toString(),
    state: { offset: 0, lastAttemptAt: undefined, inFlight: undefined },
  };
  return {
    now: (): number => Math.round(context.localNow() + context.state.offset),
    refresh: () => refresh(context),
    refreshIfStale: () => refreshIfStale(context),
  };
}
