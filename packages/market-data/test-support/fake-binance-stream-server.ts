// Copyright (c) 2026 Ada Technology. All rights reserved.
import { TIMEFRAME_DURATION_MILLISECONDS, type Timeframe } from '../src/index.js';

const LOOPBACK_HOST = '127.0.0.1';
const KLINES_PATH = '/api/v3/klines';
const SERVER_TIME_PATH = '/api/v3/time';
const STREAM_PATH = '/stream';
const STREAMS_PARAMETER = 'streams';
const HTTP_NOT_FOUND = 404;
const HTTP_IP_BANNED = 418;
const HTTP_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const DEFAULT_PAGE_LIMIT = 500;
const PRICE_CYCLE = 50;
const WEBSOCKET_GOING_AWAY = 1001;

export type KlineEventParams = {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly openTime: number;
  readonly isClosed: boolean;
};

export type KlinesRestRequest = {
  readonly symbol: string;
  readonly interval: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly limit: number;
};

export type SetHistoryParams = {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly openTimes: readonly number[];
};

export type BanRestParams = {
  readonly requests: number;
  readonly retryAfterSeconds?: number;
};

export type FakeBinanceStreamServer = {
  readonly restUrl: string;
  readonly streamUrl: string;
  readonly connectionCount: () => number;
  readonly openConnectionCount: () => number;
  readonly requestedStreams: () => readonly string[];
  readonly sendEvent: (params: KlineEventParams) => void;
  readonly sendText: (text: string) => void;
  readonly dropConnections: () => void;
  readonly refuseConnections: (isRefusing: boolean) => void;
  readonly restRequests: KlinesRestRequest[];
  readonly setHistory: (params: SetHistoryParams) => void;
  readonly holdRest: () => () => void;
  readonly failRest: (times: number) => void;
  readonly banRest: (params: BanRestParams) => void;
  // Quanto a hora que o servidor devolve em /api/v3/time se afasta do relógio real.
  readonly setServerClockSkew: (milliseconds: number) => void;
  readonly serverTimeRequestCount: () => number;
  readonly stop: () => Promise<void>;
};

// Preço determinístico por abertura: o teste calcula o valor esperado sem tabela.
export function buildFakePrice(params: {
  readonly openTime: number;
  readonly timeframe: Timeframe;
}): string {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  return `${100 + ((params.openTime / duration) % PRICE_CYCLE)}.12345678`;
}

export function buildKlineEvent(params: KlineEventParams): Readonly<Record<string, unknown>> {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  const price = buildFakePrice(params);
  return {
    stream: `${params.symbol.toLowerCase()}@kline_${params.timeframe}`,
    data: {
      e: 'kline',
      E: params.openTime + duration + 5,
      s: params.symbol,
      k: {
        t: params.openTime,
        T: params.openTime + duration - 1,
        s: params.symbol,
        i: params.timeframe,
        f: 100,
        L: 200,
        o: price,
        c: price,
        h: price,
        l: price,
        v: '12.50000000',
        n: 7,
        x: params.isClosed,
        q: '1250.00000000',
        V: '6.00000000',
        Q: '600.00000000',
        B: '0',
      },
    },
  };
}

function buildRestRow(params: Omit<KlineEventParams, 'isClosed'>): readonly unknown[] {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  const price = buildFakePrice(params);
  return [
    params.openTime,
    price,
    price,
    price,
    price,
    '12.50000000',
    params.openTime + duration - 1,
    '1250.00000000',
    7,
    '6.00000000',
    '600.00000000',
    '0',
  ];
}

function readRestRequest(url: URL): KlinesRestRequest {
  const parameters = url.searchParams;
  return {
    symbol: parameters.get('symbol') ?? '',
    interval: parameters.get('interval') ?? '',
    startTime: Number(parameters.get('startTime') ?? 0),
    endTime: Number(parameters.get('endTime') ?? Number.MAX_SAFE_INTEGER),
    limit: Number(parameters.get('limit') ?? DEFAULT_PAGE_LIMIT),
  };
}

type HistoryKey = `${string}|${string}`;

export function startFakeBinanceStreamServer(): FakeBinanceStreamServer {
  const sockets = new Set<Bun.ServerWebSocket<undefined>>();
  const streams: string[] = [];
  const history = new Map<HistoryKey, number[]>();
  const restRequests: KlinesRestRequest[] = [];
  let totalConnections = 0;
  let isRefusing = false;
  let restFailuresLeft = 0;
  let restBan: { requestsLeft: number; retryAfterSeconds: number | undefined } | undefined;
  let restGate: Promise<void> | undefined;
  let serverClockSkew = 0;
  let serverTimeRequests = 0;

  async function serveKlines(url: URL): Promise<Response> {
    const request = readRestRequest(url);
    restRequests.push(request);
    if (restGate !== undefined) await restGate;
    if (restBan !== undefined && restBan.requestsLeft > 0) {
      restBan.requestsLeft -= 1;
      const headers = new Headers();
      if (restBan.retryAfterSeconds !== undefined)
        headers.set('retry-after', String(restBan.retryAfterSeconds));
      return new Response('{}', { status: HTTP_IP_BANNED, headers });
    }
    if (restFailuresLeft > 0) {
      restFailuresLeft -= 1;
      return new Response('{}', { status: HTTP_SERVER_ERROR });
    }
    const openTimes = history.get(`${request.symbol}|${request.interval}`) ?? [];
    const timeframe = request.interval as Timeframe;
    const rows = openTimes
      .filter((openTime) => openTime >= request.startTime && openTime <= request.endTime)
      .sort((left, right) => left - right)
      .slice(0, request.limit)
      .map((openTime) => buildRestRow({ symbol: request.symbol, timeframe, openTime }));
    return Response.json(rows);
  }

  const listener = Bun.serve<undefined>({
    hostname: LOOPBACK_HOST,
    port: 0,
    fetch: (incoming, server): Response | Promise<Response> | undefined => {
      const url = new URL(incoming.url);
      if (url.pathname === KLINES_PATH) return serveKlines(url);
      if (url.pathname === SERVER_TIME_PATH) {
        serverTimeRequests += 1;
        return Response.json({ serverTime: Date.now() + serverClockSkew });
      }
      if (url.pathname !== STREAM_PATH)
        return new Response('not found', { status: HTTP_NOT_FOUND });
      if (isRefusing) return new Response('refused', { status: HTTP_SERVICE_UNAVAILABLE });
      streams.push(url.searchParams.get(STREAMS_PARAMETER) ?? '');
      totalConnections += 1;
      if (server.upgrade(incoming)) return undefined;
      return new Response('upgrade failed', { status: HTTP_SERVER_ERROR });
    },
    websocket: {
      open: (socket): void => void sockets.add(socket),
      close: (socket): void => void sockets.delete(socket),
      message: (): void => undefined,
    },
  });

  function sendText(text: string): void {
    for (const socket of sockets) socket.send(text);
  }

  return {
    restUrl: `http://${LOOPBACK_HOST}:${listener.port}`,
    streamUrl: `ws://${LOOPBACK_HOST}:${listener.port}`,
    connectionCount: (): number => totalConnections,
    openConnectionCount: (): number => sockets.size,
    requestedStreams: (): readonly string[] => streams,
    sendEvent: (params): void => sendText(JSON.stringify(buildKlineEvent(params))),
    sendText,
    dropConnections: (): void => {
      for (const socket of [...sockets]) socket.close(WEBSOCKET_GOING_AWAY);
    },
    refuseConnections: (value): void => {
      isRefusing = value;
    },
    restRequests,
    setHistory: (params): void =>
      void history.set(`${params.symbol}|${params.timeframe}`, [...params.openTimes]),
    holdRest: (): (() => void) => {
      let release: () => void = () => undefined;
      restGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    failRest: (times): void => {
      restFailuresLeft = times;
    },
    banRest: (params): void => {
      restBan = { requestsLeft: params.requests, retryAfterSeconds: params.retryAfterSeconds };
    },
    setServerClockSkew: (milliseconds): void => {
      serverClockSkew = milliseconds;
    },
    serverTimeRequestCount: (): number => serverTimeRequests,
    // O stop(true) do Bun nunca resolve depois que o servidor fechou um socket: não se espera a promessa.
    stop: (): Promise<void> => {
      void listener.stop(true);
      return Promise.resolve();
    },
  };
}
