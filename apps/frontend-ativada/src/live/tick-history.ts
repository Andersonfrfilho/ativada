// Copyright (c) 2026 Ada Technology. All rights reserved.

export const TICK_HISTORY_MILLISECONDS = 30 * 60_000;

export type HistoricTick = { readonly time: number; readonly price: string };

// Histórico curto de ticks por par, só em memória (nada vai ao disco): serve às janelas de 1 e 5 min.
export class TickHistory {
  private readonly ticks = new Map<string, HistoricTick[]>();

  constructor(private readonly capMilliseconds: number = TICK_HISTORY_MILLISECONDS) {}

  readonly record = (symbol: string, tick: HistoricTick): void => {
    const list = this.ticks.get(symbol) ?? [];
    list.push(tick);
    const cutoff = tick.time - this.capMilliseconds;
    const firstKept = list.findIndex((entry) => entry.time >= cutoff);
    if (firstKept > 0) list.splice(0, firstKept);
    this.ticks.set(symbol, list);
  };

  // O tick mais recente com `time <= limit` (o preço que valia naquele instante), ou `undefined` se o histórico começa depois.
  readonly atOrBefore = (symbol: string, limit: number): HistoricTick | undefined => {
    const list = this.ticks.get(symbol) ?? [];
    let found: HistoricTick | undefined;
    for (const entry of list) {
      if (entry.time > limit) break;
      found = entry;
    }
    return found;
  };

  readonly clear = (): void => this.ticks.clear();
}
