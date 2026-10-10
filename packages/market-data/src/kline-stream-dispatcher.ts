// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Candle } from './candle.types.js';
import { MALFORMED_REASON } from './kline-stream.constant.js';
import { parseKlineMessage } from './kline-stream.schema.js';
import type {
  DisconnectReason,
  KlineStreamSettings,
  KlineStreamStats,
  MalformedReason,
} from './kline-stream.types.js';
import type { ResolvedStreamSettings } from './resolve-stream-settings.js';

export type KlineStreamCounters = {
  -readonly [Key in keyof KlineStreamStats]: KlineStreamStats[Key];
};

export type StreamLifecycle = { isClosed: boolean };

export type DispatcherParams = {
  readonly settings: KlineStreamSettings;
  readonly config: ResolvedStreamSettings;
  readonly counters: KlineStreamCounters;
  readonly lifecycle: StreamLifecycle;
};

export type StreamDispatcher = {
  readonly handleData: (data: unknown) => void;
  readonly handleOpen: () => void;
  readonly notifyDisconnected: (reason: DisconnectReason) => void;
};

export function createCounters(): KlineStreamCounters {
  return {
    attemptCount: 0,
    deliveredCount: 0,
    ignoredOpenCount: 0,
    malformedCount: 0,
    handlerFailureCount: 0,
    loopFailureCount: 0,
  };
}

// O consumidor nunca derruba a conexão: falha de callback é contada e descartada.
function runHandler(counters: KlineStreamCounters, handler: () => void | Promise<void>): void {
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

function reportMalformed(params: DispatcherParams, reason: MalformedReason): void {
  const { counters, settings } = params;
  counters.malformedCount += 1;
  const count = counters.malformedCount;
  const { onMalformed } = settings;
  if (onMalformed !== undefined) runHandler(counters, () => onMalformed({ reason, count }));
}

function isSubscribed(config: ResolvedStreamSettings, candle: Candle): boolean {
  return config.symbols.has(candle.symbol) && config.timeframes.has(candle.timeframe);
}

function dispatchData(params: DispatcherParams, data: unknown): void {
  const { counters, settings, config, lifecycle } = params;
  if (lifecycle.isClosed) return;
  if (typeof data !== 'string') return reportMalformed(params, MALFORMED_REASON.NOT_TEXT);
  const message = parseKlineMessage(data);
  if (message.kind === 'malformed') return reportMalformed(params, message.reason);
  if (message.kind === 'open') {
    counters.ignoredOpenCount += 1;
    return;
  }
  if (!isSubscribed(config, message.candle)) {
    return reportMalformed(params, MALFORMED_REASON.UNSUBSCRIBED);
  }
  counters.deliveredCount += 1;
  runHandler(counters, () => settings.onCandle(message.candle));
}

export function createStreamDispatcher(params: DispatcherParams): StreamDispatcher {
  const { counters, settings } = params;
  return {
    handleData: (data): void => dispatchData(params, data),
    handleOpen: (): void => {
      const { onConnected } = settings;
      const attempt = counters.attemptCount;
      if (onConnected !== undefined) runHandler(counters, () => onConnected({ attempt }));
    },
    notifyDisconnected: (reason): void => {
      const { onDisconnected } = settings;
      if (onDisconnected !== undefined) runHandler(counters, () => onDisconnected({ reason }));
    },
  };
}
