// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Candle } from './candle.types.js';
import { createCancellableSleep } from './cancellable-sleep.js';
import {
  openKlineConnection,
  type ConnectionEnd,
  type OpenConnection,
} from './kline-stream-connection.js';
import { MALFORMED_REASON } from './kline-stream.constant.js';
import { parseKlineMessage } from './kline-stream.schema.js';
import type {
  KlineStream,
  KlineStreamSettings,
  KlineStreamStats,
  MalformedReason,
} from './kline-stream.types.js';
import { computeBackoffDelay } from './reconnect-backoff.js';
import { resolveStreamSettings } from './resolve-stream-settings.js';

type Counters = {
  attemptCount: number;
  deliveredCount: number;
  ignoredOpenCount: number;
  malformedCount: number;
  handlerFailureCount: number;
};

export function createKlineStream(settings: KlineStreamSettings): KlineStream {
  const config = resolveStreamSettings(settings);
  const now = settings.now ?? Date.now;
  const random = settings.random ?? Math.random;
  const cancellable = createCancellableSleep();
  const sleep = settings.sleep ?? cancellable.sleep;
  const webSocketFactory =
    settings.webSocketFactory ?? ((url: string): WebSocket => new WebSocket(url));
  const counters: Counters = {
    attemptCount: 0,
    deliveredCount: 0,
    ignoredOpenCount: 0,
    malformedCount: 0,
    handlerFailureCount: 0,
  };
  let isClosed = false;
  let consecutiveFailures = 0;
  let activeConnection: OpenConnection | undefined;
  let notifyClosed: () => void = () => undefined;
  const closedSignal = new Promise<void>((resolve) => {
    notifyClosed = resolve;
  });

  // O consumidor nunca derruba a conexão: falha de callback é contada e descartada.
  function runHandler(handler: () => void | Promise<void>): void {
    const recordFailure = (): void => {
      counters.handlerFailureCount += 1;
    };
    try {
      const outcome = handler();
      if (outcome instanceof Promise) outcome.catch(recordFailure);
    } catch {
      recordFailure();
    }
  }

  function reportMalformed(reason: MalformedReason): void {
    counters.malformedCount += 1;
    const count = counters.malformedCount;
    const { onMalformed } = settings;
    if (onMalformed !== undefined) runHandler(() => onMalformed({ reason, count }));
  }

  function isSubscribed(candle: Candle): boolean {
    return config.symbols.has(candle.symbol) && config.timeframes.has(candle.timeframe);
  }

  function handleData(data: unknown): void {
    if (isClosed) return;
    if (typeof data !== 'string') return reportMalformed(MALFORMED_REASON.NOT_TEXT);
    const message = parseKlineMessage(data);
    if (message.kind === 'malformed') return reportMalformed(message.reason);
    if (message.kind === 'open') {
      counters.ignoredOpenCount += 1;
      return;
    }
    if (!isSubscribed(message.candle)) return reportMalformed(MALFORMED_REASON.UNSUBSCRIBED);
    counters.deliveredCount += 1;
    runHandler(() => settings.onCandle(message.candle));
  }

  function handleOpen(): void {
    const { onConnected } = settings;
    const attempt = counters.attemptCount;
    if (onConnected !== undefined) runHandler(() => onConnected({ attempt }));
  }

  function isStable(end: ConnectionEnd): boolean {
    return end.openedAt !== undefined && now() - end.openedAt >= config.stableAfterMilliseconds;
  }

  async function connectOnce(): Promise<ConnectionEnd> {
    counters.attemptCount += 1;
    activeConnection = openKlineConnection({
      url: config.url,
      webSocketFactory,
      staleAfterMilliseconds: config.staleAfterMilliseconds,
      now,
      onOpen: handleOpen,
      onData: handleData,
    });
    return activeConnection.ended;
  }

  async function run(): Promise<void> {
    while (!isClosed) {
      const end = await connectOnce();
      if (isClosed) return;
      const { onDisconnected } = settings;
      if (onDisconnected !== undefined) runHandler(() => onDisconnected({ reason: end.reason }));
      if (isStable(end)) consecutiveFailures = 0;
      const delay = computeBackoffDelay({
        attempt: consecutiveFailures,
        baseMilliseconds: config.reconnectBaseMilliseconds,
        maxMilliseconds: config.reconnectMaxMilliseconds,
        random,
      });
      consecutiveFailures += 1;
      await Promise.race([sleep(delay), closedSignal]);
    }
  }

  const running = run();

  return {
    close: (): Promise<void> => {
      isClosed = true;
      notifyClosed();
      cancellable.cancelAll();
      activeConnection?.abort();
      return running;
    },
    stats: (): KlineStreamStats => ({ ...counters }),
  };
}
