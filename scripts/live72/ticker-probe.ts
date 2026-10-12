// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readData, requestApi } from '../admin-test/api-request.js';
import { MILLISECONDS_PER_SECOND } from './live72.constant.js';

const TICKETS_PATH = '/v1/stream/tickets';
const STREAM_PATH = '/v1/stream';
const PROBE_TIMEOUT_MILLISECONDS = 8 * MILLISECONDS_PER_SECOND;

export type TickerProbeParams = {
  readonly apiBaseUrl: string;
  readonly accessToken: string;
  readonly origin: string;
  readonly symbol: string;
};

type TickMessage = { readonly type: string; readonly at: number; readonly serverTime: number };

function isTick(value: unknown): value is TickMessage {
  if (typeof value !== 'object' || value === null) return false;
  const record = Object.fromEntries(Object.entries(value));
  return (
    record['type'] === 'tick' &&
    typeof record['at'] === 'number' &&
    typeof record['serverTime'] === 'number'
  );
}

// Idade (s) do último tick público recebido pela API: assina o par por WebSocket como o painel faria.
export async function probeTickerAgeSeconds(
  params: TickerProbeParams,
): Promise<number | undefined> {
  const issued = await requestApi({
    baseUrl: params.apiBaseUrl,
    path: TICKETS_PATH,
    method: 'POST',
    token: params.accessToken,
  });
  const ticket = readData(issued)['ticket'];
  if (typeof ticket !== 'string') return undefined;
  const socket = new WebSocket(
    `${params.apiBaseUrl.replace(/^http/, 'ws')}${STREAM_PATH}?ticket=${ticket}`,
    { headers: { Origin: params.origin } },
  );
  return new Promise<number | undefined>((resolve) => {
    const timer = setTimeout(() => finish(undefined), PROBE_TIMEOUT_MILLISECONDS);
    function finish(age: number | undefined): void {
      clearTimeout(timer);
      socket.close();
      resolve(age);
    }
    socket.onopen = (): void =>
      socket.send(JSON.stringify({ type: 'subscribe', pairs: [params.symbol] }));
    socket.onerror = (): void => finish(undefined);
    socket.onmessage = (event): void => {
      const message: unknown = JSON.parse(String(event.data));
      if (isTick(message))
        finish(Math.max(0, message.serverTime - message.at) / MILLISECONDS_PER_SECOND);
    };
  });
}
