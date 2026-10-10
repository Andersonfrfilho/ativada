// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createKlineStream,
  type Candle,
  type KlineStream,
  type KlineStreamSettings,
} from '../../packages/market-data/src/index.js';
import {
  startFakeBinanceStreamServer,
  type FakeBinanceStreamServer,
} from '../../packages/market-data/test-support/fake-binance-stream-server.js';

export const HOUR = 3_600_000;
export const FIRST_OPEN_TIME = Date.parse('2026-10-01T00:00:00.000Z');
export const BASE_DELAY = 100;
export const MAX_DELAY = 400;
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'] as const;
const TIMEFRAMES = ['1h', '4h'] as const;

export type StreamHarness = {
  readonly server: FakeBinanceStreamServer;
  readonly open: (overrides?: Partial<KlineStreamSettings>) => OpenedStream;
  readonly sendClosed: (openTime: number, symbol?: string) => void;
  readonly closeAll: () => Promise<void>;
};

export type OpenedStream = {
  readonly candles: Candle[];
  readonly attempts: number[];
  readonly disconnections: string[];
  readonly malformedReasons: string[];
  readonly stream: KlineStream;
};

export function createStreamHarness(): StreamHarness {
  const server = startFakeBinanceStreamServer();
  const openStreams: KlineStream[] = [];
  return {
    server,
    open: (overrides = {}): OpenedStream => {
      const candles: Candle[] = [];
      const attempts: number[] = [];
      const disconnections: string[] = [];
      const malformedReasons: string[] = [];
      const stream = createKlineStream({
        symbols: [...SYMBOLS],
        timeframes: [...TIMEFRAMES],
        baseUrl: server.streamUrl,
        staleAfterMilliseconds: 5_000,
        reconnectBaseMilliseconds: BASE_DELAY,
        reconnectMaxMilliseconds: MAX_DELAY,
        random: () => 0.5,
        onCandle: (candle) => void candles.push(candle),
        onConnected: ({ attempt }) => void attempts.push(attempt),
        onDisconnected: ({ reason }) => void disconnections.push(reason),
        onMalformed: ({ reason }) => void malformedReasons.push(reason),
        ...overrides,
      });
      openStreams.push(stream);
      return { candles, attempts, disconnections, malformedReasons, stream };
    },
    sendClosed: (openTime, symbol = 'BTCUSDT'): void =>
      server.sendEvent({ symbol, timeframe: '1h', openTime, isClosed: true }),
    closeAll: async (): Promise<void> => {
      await Promise.all(openStreams.splice(0).map((stream) => stream.close()));
      await server.stop();
    },
  };
}
