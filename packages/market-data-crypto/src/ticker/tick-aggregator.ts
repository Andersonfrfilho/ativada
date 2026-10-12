// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RawTick } from './ticker.types.js';

export type TickAggregatorSettings<TTimer> = {
  readonly intervalMilliseconds: number;
  readonly setTimer: (callback: () => void, milliseconds: number) => TTimer;
  readonly clearTimer: (timer: TTimer) => void;
  readonly publish: (tick: RawTick) => void;
  readonly reportError?: ((error: unknown) => void) | undefined;
};

export type TickAggregator = {
  readonly push: (tick: RawTick) => void;
  readonly close: () => void;
};

type PairWindow<TTimer> = { latest: RawTick; timer: TTimer | undefined };

// No máximo UMA publicação por intervalo por par, sempre a ÚLTIMA: a primeira tick de uma janela abre o intervalo e, no
// fim dele, só o que chegou por último sai. 100 ticks em 1 s viram 1 publicação. Tick com instante igual ou menor que
// o último aceito do par (reentrega depois da reconexão, tick atrasado) é ignorado, então nada sai duas vezes.
export function createTickAggregator<TTimer>(
  settings: TickAggregatorSettings<TTimer>,
): TickAggregator {
  const windows = new Map<string, PairWindow<TTimer>>();
  const lastAcceptedTimes = new Map<string, number>();
  let isClosed = false;

  function flush(symbol: string): void {
    const pair = windows.get(symbol);
    if (pair === undefined) return;
    pair.timer = undefined;
    try {
      settings.publish(pair.latest);
    } catch (error: unknown) {
      settings.reportError?.(error);
    }
  }

  return {
    push: (tick): void => {
      const lastTime = lastAcceptedTimes.get(tick.symbol);
      if (isClosed || (lastTime !== undefined && tick.eventTime <= lastTime)) return;
      lastAcceptedTimes.set(tick.symbol, tick.eventTime);
      const pair = windows.get(tick.symbol) ?? { latest: tick, timer: undefined };
      pair.latest = tick;
      windows.set(tick.symbol, pair);
      pair.timer ??= settings.setTimer(() => flush(tick.symbol), settings.intervalMilliseconds);
    },
    close: (): void => {
      isClosed = true;
      for (const pair of windows.values()) {
        if (pair.timer !== undefined) settings.clearTimer(pair.timer);
        pair.timer = undefined;
      }
      windows.clear();
    },
  };
}
