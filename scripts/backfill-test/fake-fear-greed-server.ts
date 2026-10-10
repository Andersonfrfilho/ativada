// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  FEAR_GREED_HISTORY_DAYS,
  FEAR_GREED_PATH,
  HTTP_SERVER_ERROR,
  LOOPBACK_HOST,
  MILLISECONDS_PER_DAY,
} from './backfill-test.constant.js';

const MILLISECONDS_PER_SECOND = 1_000;
const SERIES_STEP = 7;
const VALUE_RANGE = 101;

export type FakeFearGreedServer = {
  readonly baseUrl: string;
  readonly todayDate: string;
  readonly requestedLimits: number[];
  todayValue: number;
  isFailing: boolean;
  readonly valueOf: (daysAgo: number) => number;
  readonly resetRequests: () => void;
  readonly stop: () => Promise<void>;
};

function toIsoDate(timestampMilliseconds: number): string {
  return new Date(timestampMilliseconds).toISOString().slice(0, 'AAAA-MM-DD'.length);
}

// Mesma forma da alternative.me: do mais recente ao mais antigo, tudo em texto, segundos UNIX à meia-noite UTC.
function buildBody(server: FakeFearGreedServer, todayStart: number, limit: number): unknown {
  const count = limit === 0 ? FEAR_GREED_HISTORY_DAYS : Math.min(limit, FEAR_GREED_HISTORY_DAYS);
  const data = Array.from({ length: count }, (_unused, daysAgo) => ({
    value: String(server.valueOf(daysAgo)),
    value_classification: 'Neutral',
    timestamp: String((todayStart - daysAgo * MILLISECONDS_PER_DAY) / MILLISECONDS_PER_SECOND),
  }));
  return { name: 'Fear and Greed Index', data, metadata: { error: null } };
}

export function startFakeFearGreedServer(): FakeFearGreedServer {
  const todayStart = Math.floor(Date.now() / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY;
  const requestedLimits: number[] = [];
  const listener = Bun.serve({
    hostname: LOOPBACK_HOST,
    port: 0,
    fetch: (incoming): Response => {
      const url = new URL(incoming.url);
      if (url.pathname !== FEAR_GREED_PATH) return new Response('not found', { status: 404 });
      const limit = Number(url.searchParams.get('limit') ?? 1);
      requestedLimits.push(limit);
      if (server.isFailing) return new Response('{}', { status: HTTP_SERVER_ERROR });
      return Response.json(buildBody(server, todayStart, limit));
    },
  });
  const server: FakeFearGreedServer = {
    baseUrl: `http://${LOOPBACK_HOST}:${listener.port}${FEAR_GREED_PATH}`,
    todayDate: toIsoDate(todayStart),
    requestedLimits,
    todayValue: 50,
    isFailing: false,
    valueOf: (daysAgo): number =>
      daysAgo === 0 ? server.todayValue : (daysAgo * SERIES_STEP) % VALUE_RANGE,
    resetRequests: (): void => void requestedLimits.splice(0, requestedLimits.length),
    stop: async (): Promise<void> => listener.stop(true),
  };
  return server;
}
