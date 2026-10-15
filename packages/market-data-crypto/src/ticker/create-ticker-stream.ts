// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createCancellableSleep } from '../cancellable-sleep.js';
import type { StreamDispatcher, StreamLifecycle } from '../kline-stream-dispatcher.js';
import { MALFORMED_REASON } from '../kline-stream.constant.js';
import type { MalformedReason } from '../kline-stream.types.js';
import { createReconnectLoop } from '../kline-stream-loop.js';
import { resolveTickerSettings, type ResolvedTickerSettings } from './resolve-ticker-settings.js';
import { parseTickerMessage } from './ticker-stream.schema.js';
import type {
  RawCandle,
  TickerStream,
  TickerStreamSettings,
  TickerStreamStats,
} from './ticker.types.js';

type TickerCounters = { -readonly [Key in keyof TickerStreamStats]: TickerStreamStats[Key] };

type DispatcherParams = {
  readonly settings: TickerStreamSettings;
  readonly config: ResolvedTickerSettings;
  readonly counters: TickerCounters;
  readonly lifecycle: StreamLifecycle;
};

// O consumidor nunca derruba a conexão: falha de callback é contada e descartada.
function runHandler(counters: TickerCounters, handler: () => void | Promise<void>): void {
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

// A vela só vale para o par e a vela assinados; sem `onCandle` ela é lida e descartada.
function dispatchCandle(params: DispatcherParams, candle: RawCandle): void {
  const { counters, settings, config } = params;
  const isSubscribed = config.symbols.has(candle.symbol) && config.timeframes.has(candle.timeframe);
  if (!isSubscribed) return reportMalformed(params, MALFORMED_REASON.UNSUBSCRIBED);
  const { onCandle } = settings;
  if (onCandle === undefined) return;
  counters.deliveredCount += 1;
  runHandler(counters, () => onCandle(candle));
}

function dispatchData(params: DispatcherParams, data: unknown): void {
  const { counters, settings, config, lifecycle } = params;
  if (lifecycle.isClosed) return;
  if (typeof data !== 'string') return reportMalformed(params, MALFORMED_REASON.NOT_TEXT);
  const message = parseTickerMessage(data);
  if (message.kind === 'malformed') return reportMalformed(params, message.reason);
  if (message.kind === 'candle') return dispatchCandle(params, message.candle);
  if (!config.symbols.has(message.tick.symbol)) {
    return reportMalformed(params, MALFORMED_REASON.UNSUBSCRIBED);
  }
  counters.deliveredCount += 1;
  runHandler(counters, () => settings.onTick(message.tick));
}

function createTickerDispatcher(params: DispatcherParams): StreamDispatcher {
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

// UMA conexão com o ticker público de todos os pares habilitados: reconecta com espera exponencial e jitter, vigia o
// silêncio e entrega cada tick validado. Quem agrega (1 por segundo por par) e publica é o consumidor.
export function createTickerStream(settings: TickerStreamSettings): TickerStream {
  const config = resolveTickerSettings(settings);
  const counters: TickerCounters = {
    attemptCount: 0,
    deliveredCount: 0,
    malformedCount: 0,
    handlerFailureCount: 0,
    loopFailureCount: 0,
  };
  const lifecycle: StreamLifecycle = { isClosed: false };
  const cancellable = createCancellableSleep();
  const loop = createReconnectLoop({
    config,
    counters,
    lifecycle,
    dispatcher: createTickerDispatcher({ settings, config, counters, lifecycle }),
    cancellable,
    now: settings.now ?? Date.now,
    random: settings.random ?? Math.random,
    sleep: settings.sleep ?? cancellable.sleep,
    webSocketFactory: settings.webSocketFactory ?? ((url: string): WebSocket => new WebSocket(url)),
  });
  return {
    close: (): Promise<void> => {
      loop.stop();
      return loop.done;
    },
    stats: () => ({ ...counters }),
  };
}
