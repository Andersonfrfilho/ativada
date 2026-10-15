// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { StreamCandle } from './stream.validation.js';

// A vela em formação (spec 009, D9): no máximo uma por par e vela. `receivedAt` é o relógio DESTE navegador.
export type FormingCandle = {
  readonly candle: StreamCandle;
  readonly receivedAt: number;
};

export function candleKey(symbol: string, timeframe: string): string {
  return `${symbol}|${timeframe}`;
}

// Guarda só a vela ABERTA de cada par e vela, fora do React e separada do preço: a mensagem `candle` chega a cada
// segundo e só quem desenha a vela re-renderiza. A vela fechada sai daqui (a fechada de verdade chega pelo REST, depois do
// aviso `runs`), e mensagem atrasada de uma vela mais velha não desfaz a atual.
export class CandleStore {
  private forming: ReadonlyMap<string, FormingCandle> = new Map();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly now: () => number) {}

  readonly getSnapshot = (): ReadonlyMap<string, FormingCandle> => this.forming;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  readonly apply = (candle: StreamCandle): void => {
    const key = candleKey(candle.symbol, candle.timeframe);
    const current = this.forming.get(key)?.candle;
    const isOlder =
      current !== undefined &&
      (candle.openTime < current.openTime ||
        (candle.openTime === current.openTime && candle.at < current.at));
    if (isOlder) return;
    const next = new Map(this.forming);
    if (candle.closed) next.delete(key);
    else next.set(key, { candle, receivedAt: this.now() });
    this.publish(next);
  };

  readonly clear = (): void => this.publish(new Map());

  private publish(next: ReadonlyMap<string, FormingCandle>): void {
    this.forming = next;
    this.listeners.forEach((listener) => listener());
  }
}
