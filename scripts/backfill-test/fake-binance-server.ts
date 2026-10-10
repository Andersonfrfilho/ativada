// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  DURATION_MILLISECONDS,
  HTTP_SERVER_ERROR,
  KLINES_PATH,
  LOOPBACK_HOST,
  SERVER_TIME_PATH,
  type BackfillTimeframe,
} from './backfill-test.constant.js';

export type KlinesRequest = {
  readonly symbol: string;
  readonly interval: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly limit: number;
};

export type WithheldRange = {
  readonly symbol: string;
  readonly interval: string;
  readonly fromOpenTime: number;
  readonly toOpenTime: number;
};

export type FakeBinanceServer = {
  readonly baseUrl: string;
  readonly requests: KlinesRequest[];
  readonly withheld: WithheldRange[];
  failFromRequest: number | undefined;
  readonly resetRequests: () => void;
  readonly stop: () => Promise<void>;
};

function isTimeframe(value: string): value is BackfillTimeframe {
  return value in DURATION_MILLISECONDS;
}

function buildRow(openTime: number, duration: number): readonly unknown[] {
  const price = `${100 + ((openTime / duration) % 50)}.50000000`;
  return [
    openTime,
    price,
    price,
    price,
    price,
    '1.00000000',
    openTime + duration - 1,
    '10.00000000',
    1,
    '0.5',
    '5',
    '0',
  ];
}

function isWithheld(server: FakeBinanceServer, request: KlinesRequest, openTime: number): boolean {
  return server.withheld.some(
    (range) =>
      range.symbol === request.symbol &&
      range.interval === request.interval &&
      openTime >= range.fromOpenTime &&
      openTime <= range.toOpenTime,
  );
}

// Como a Binance: grade completa até o candle ainda aberto, cortada por startTime, endTime e limit.
function buildPage(server: FakeBinanceServer, request: KlinesRequest): readonly unknown[] {
  if (!isTimeframe(request.interval)) return [];
  const duration = DURATION_MILLISECONDS[request.interval];
  const currentOpenTime = Math.floor(Date.now() / duration) * duration;
  const lastOpenTime = Math.min(request.endTime, currentOpenTime);
  const page: unknown[] = [];
  for (
    let openTime = Math.ceil(request.startTime / duration) * duration;
    openTime <= lastOpenTime && page.length < request.limit;
    openTime += duration
  ) {
    if (!isWithheld(server, request, openTime)) page.push(buildRow(openTime, duration));
  }
  return page;
}

function readRequest(url: URL): KlinesRequest {
  const parameters = url.searchParams;
  return {
    symbol: parameters.get('symbol') ?? '',
    interval: parameters.get('interval') ?? '',
    startTime: Number(parameters.get('startTime') ?? 0),
    endTime: Number(parameters.get('endTime') ?? Number.MAX_SAFE_INTEGER),
    limit: Number(parameters.get('limit') ?? 500),
  };
}

export function startFakeBinanceServer(): FakeBinanceServer {
  const requests: KlinesRequest[] = [];
  const listener = Bun.serve({
    hostname: LOOPBACK_HOST,
    port: 0,
    fetch: (incoming): Response => {
      const url = new URL(incoming.url);
      if (url.pathname === SERVER_TIME_PATH) return Response.json({ serverTime: Date.now() });
      if (url.pathname !== KLINES_PATH) return new Response('not found', { status: 404 });
      const request = readRequest(url);
      requests.push(request);
      if (server.failFromRequest !== undefined && requests.length >= server.failFromRequest)
        return new Response('{}', { status: HTTP_SERVER_ERROR });
      return Response.json(buildPage(server, request));
    },
  });
  const server: FakeBinanceServer = {
    baseUrl: `http://${LOOPBACK_HOST}:${listener.port}`,
    requests,
    withheld: [],
    failFromRequest: undefined,
    resetRequests: (): void => void requests.splice(0, requests.length),
    stop: async (): Promise<void> => listener.stop(true),
  };
  return server;
}
