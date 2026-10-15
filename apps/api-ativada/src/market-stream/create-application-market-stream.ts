// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MILLISECONDS_PER_SECOND } from '@ativada/environment';
import {
  createServerClock,
  createTickerStream,
  type ServerClock,
  type TickerStream,
} from '@ativada/market-data-crypto';

import type { Environment } from '../environment.js';
import type { Logger } from '../logging/logger.js';
import { createMarketPublisher } from './create-market-publisher.js';
import type { MarketPublisher } from './market-context.js';
import { STALE_SWEEP_INTERVAL_MILLISECONDS } from './market-stream.constant.js';

export type MarketEnvironment = Pick<
  Environment,
  | 'MARKET_SYMBOLS'
  | 'MARKET_TIMEFRAMES'
  | 'TICKER_KLINE_ENABLED'
  | 'BINANCE_BASE_URL'
  | 'BINANCE_STREAM_URL'
  | 'TICKER_STALE_SECONDS'
  | 'STREAM_MAX_PAIRS_PER_SOCKET'
>;

export type ApplicationMarketStream = {
  readonly publisher: MarketPublisher;
  readonly start: () => void;
  readonly close: () => Promise<void>;
};

export type ApplicationMarketStreamParams = {
  readonly environment: MarketEnvironment;
  readonly logger: Logger;
  readonly reportError: (error: unknown) => void;
};

const LOG_MESSAGE = 'market stream';

function createPublisher(
  params: ApplicationMarketStreamParams,
  serverClock: ServerClock,
): MarketPublisher {
  const { environment } = params;
  return createMarketPublisher<ReturnType<typeof setTimeout>>({
    pairs: environment.MARKET_SYMBOLS,
    maxPairsPerSocket: environment.STREAM_MAX_PAIRS_PER_SOCKET,
    staleAfterMilliseconds: environment.TICKER_STALE_SECONDS * MILLISECONDS_PER_SECOND,
    now: () => Date.now(),
    serverTime: () => serverClock.now(),
    setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimer: (timer) => clearTimeout(timer),
    reportError: params.reportError,
  });
}

function openTicker(
  params: ApplicationMarketStreamParams,
  serverClock: ServerClock,
  publisher: MarketPublisher,
): TickerStream {
  return createTickerStream({
    symbols: params.environment.MARKET_SYMBOLS,
    timeframes: params.environment.TICKER_KLINE_ENABLED ? params.environment.MARKET_TIMEFRAMES : [],
    baseUrl: params.environment.BINANCE_STREAM_URL,
    onCandle: (candle) => publisher.handleRawCandle(candle),
    onTick: (tick) => {
      void serverClock.refreshIfStale();
      publisher.handleRawTick(tick);
    },
    onDisconnected: (event) =>
      params.logger.warn(LOG_MESSAGE, { event: 'ticker.disconnected', ...event }),
  });
}

// UMA conexão com o ticker público da Binance serve todos os usuários (RNF06, RNF09): reconecta sozinha, a hora do
// servidor vem do relógio já medido e o selo de dado velho é varrido a cada segundo.
export function createApplicationMarketStream(
  params: ApplicationMarketStreamParams,
): ApplicationMarketStream {
  const serverClock = createServerClock({
    baseUrl: params.environment.BINANCE_BASE_URL,
    onWarning: (warning) => params.logger.warn(LOG_MESSAGE, { event: 'clock.warning', ...warning }),
  });
  const publisher = createPublisher(params, serverClock);
  let ticker: TickerStream | undefined;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  return {
    publisher,
    start: (): void => {
      if (ticker !== undefined) return;
      void serverClock.refresh();
      ticker = openTicker(params, serverClock, publisher);
      sweeper = setInterval(publisher.sweepStale, STALE_SWEEP_INTERVAL_MILLISECONDS);
    },
    close: async (): Promise<void> => {
      clearInterval(sweeper);
      publisher.close();
      await ticker?.close();
    },
  };
}
