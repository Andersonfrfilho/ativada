// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RawCandle } from './ticker.types.js';

export type CandleAggregatorSettings<TTimer> = {
  readonly intervalMilliseconds: number;
  readonly setTimer: (callback: () => void, milliseconds: number) => TTimer;
  readonly clearTimer: (timer: TTimer) => void;
  readonly publish: (candle: RawCandle) => void;
  readonly reportError?: ((error: unknown) => void) | undefined;
};

export type CandleAggregator = {
  readonly push: (candle: RawCandle) => void;
  readonly close: () => void;
};

type KeyWindow<TTimer> = { latest: RawCandle; timer: TTimer | undefined };

const keyOf = (candle: RawCandle): string => `${candle.symbol}:${candle.timeframe}`;

// No máximo UMA publicação por intervalo por (par, vela), sempre a ÚLTIMA: a Binance empurra a vela aberta a cada ~2 s por
// stream e o painel só precisa de 1 por segundo. Evento com instante igual ou menor que o último aceito da chave (reentrega
// depois da reconexão, evento atrasado) é ignorado, então nada sai duas vezes.
export function createCandleAggregator<TTimer>(
  settings: CandleAggregatorSettings<TTimer>,
): CandleAggregator {
  const windows = new Map<string, KeyWindow<TTimer>>();
  const lastAcceptedTimes = new Map<string, number>();
  let isClosed = false;

  function flush(key: string): void {
    const pair = windows.get(key);
    if (pair === undefined) return;
    pair.timer = undefined;
    try {
      settings.publish(pair.latest);
    } catch (error: unknown) {
      settings.reportError?.(error);
    }
  }

  return {
    push: (candle): void => {
      const key = keyOf(candle);
      const lastTime = lastAcceptedTimes.get(key);
      if (isClosed || (lastTime !== undefined && candle.eventTime <= lastTime)) return;
      lastAcceptedTimes.set(key, candle.eventTime);
      const window = windows.get(key) ?? { latest: candle, timer: undefined };
      window.latest = candle;
      windows.set(key, window);
      window.timer ??= settings.setTimer(() => flush(key), settings.intervalMilliseconds);
    },
    close: (): void => {
      isClosed = true;
      for (const window of windows.values()) {
        if (window.timer !== undefined) settings.clearTimer(window.timer);
        window.timer = undefined;
      }
      windows.clear();
    },
  };
}
