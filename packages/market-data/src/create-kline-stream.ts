// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createCancellableSleep } from './cancellable-sleep.js';
import {
  createCounters,
  createStreamDispatcher,
  type StreamLifecycle,
} from './kline-stream-dispatcher.js';
import { createReconnectLoop } from './kline-stream-loop.js';
import type { KlineStream, KlineStreamSettings } from './kline-stream.types.js';
import { resolveStreamSettings } from './resolve-stream-settings.js';

export function createKlineStream(settings: KlineStreamSettings): KlineStream {
  const config = resolveStreamSettings(settings);
  const counters = createCounters();
  const lifecycle: StreamLifecycle = { isClosed: false };
  const cancellable = createCancellableSleep();
  const loop = createReconnectLoop({
    config,
    counters,
    lifecycle,
    dispatcher: createStreamDispatcher({ settings, config, counters, lifecycle }),
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
