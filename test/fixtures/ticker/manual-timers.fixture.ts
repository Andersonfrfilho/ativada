// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RawTick } from '../../../packages/market-data/src/ticker/ticker.types.js';

export type ManualTimers = {
  readonly setTimer: (callback: () => void, milliseconds: number) => number;
  readonly clearTimer: (handle: number) => void;
  readonly advance: (milliseconds: number) => void;
  readonly pendingCount: () => number;
  // Os instantes (no relógio do teste) em que cada temporizador disparou.
  readonly firedAt: number[];
};

// Temporizadores à mão: o tempo só anda quando o teste manda, então "100 ticks em 1 s" não depende do relógio da máquina.
export function createManualTimers(): ManualTimers {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, { readonly dueAt: number; readonly callback: () => void }>();
  const firedAt: number[] = [];

  function advance(milliseconds: number): void {
    const target = now + milliseconds;
    for (;;) {
      const due = [...pending.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      if (due === undefined) break;
      const [handle, timer] = due;
      pending.delete(handle);
      now = timer.dueAt;
      firedAt.push(now);
      timer.callback();
    }
    now = target;
  }

  return {
    setTimer: (callback, milliseconds): number => {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, { dueAt: now + milliseconds, callback });
      return handle;
    },
    clearTimer: (handle) => void pending.delete(handle),
    advance,
    pendingCount: () => pending.size,
    firedAt,
  };
}

// Um tick de teste: o preço e a abertura derivam do instante do evento, e dois ticks com o mesmo instante são iguais.
export function tick(symbol: string, eventTime: number): RawTick {
  return { symbol, price: `${100 + eventTime}.00000000`, openPrice: '100.00000000', eventTime };
}
