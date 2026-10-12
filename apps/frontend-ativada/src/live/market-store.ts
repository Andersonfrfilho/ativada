// Copyright (c) 2026 Ada Technology. All rights reserved.
import { STREAM_STATUS, type StreamStatus } from './stream.constant.js';
import type { MarketTick } from './stream-client.js';

// RF16: sem mensagem há mais de 10 s o painel passa a dizer "sem dados há N s".
export const MARKET_SILENCE_MILLISECONDS = 10_000;
const MILLISECONDS_PER_SECOND = 1_000;
const PERCENT_DIVISOR = 100;

// `change24h` já em fração (0,0123 = +1,23%); `receivedAt` é o relógio DESTE navegador, não o da corretora.
export type LivePrice = {
  readonly price: string;
  readonly change24h: number | undefined;
  readonly receivedAt: number;
  readonly isStale: boolean;
};

export type MarketState = 'live' | 'waiting' | 'stale' | 'offline';

export type MarketStatus = {
  readonly state: MarketState;
  readonly secondsWithoutData: number | undefined;
};

function toRatio(percentText: string | null): number | undefined {
  if (percentText === null) return undefined;
  const percent = Number(percentText);
  return Number.isFinite(percent) ? percent / PERCENT_DIVISOR : undefined;
}

// O último preço de cada par, fora do React: o tick chega a cada segundo por par e só quem lê o preço re-renderiza.
export class MarketStore {
  private prices: ReadonlyMap<string, LivePrice> = new Map();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly now: () => number) {}

  readonly getSnapshot = (): ReadonlyMap<string, LivePrice> => this.prices;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  readonly applyTick = (tick: MarketTick): void => {
    const next = new Map(this.prices);
    next.set(tick.symbol, {
      price: tick.price,
      change24h: toRatio(tick.change24h),
      receivedAt: this.now(),
      isStale: tick.isStale,
    });
    this.publish(next);
  };

  readonly clear = (): void => this.publish(new Map());

  private publish(next: ReadonlyMap<string, LivePrice>): void {
    this.prices = next;
    this.listeners.forEach((listener) => listener());
  }
}

export type ComputeMarketStateParams = {
  readonly streamStatus: StreamStatus;
  readonly prices: ReadonlyMap<string, LivePrice>;
  readonly now: number;
  readonly silenceMilliseconds?: number;
};

export type IsPriceFreshParams = {
  readonly price: LivePrice;
  readonly now: number;
  readonly silenceMilliseconds: number;
};

// A idade é POR PAR: um par mudo não pode parecer ao vivo só porque outro par continua chegando.
export function isPriceFresh(params: IsPriceFreshParams): boolean {
  return (
    !params.price.isStale && params.now - params.price.receivedAt <= params.silenceMilliseconds
  );
}

function lastReceivedAt(prices: ReadonlyMap<string, LivePrice>): number | undefined {
  const times = [...prices.values()].map((price) => price.receivedAt);
  return times.length === 0 ? undefined : Math.max(...times);
}

export function computeMarketState(params: ComputeMarketStateParams): MarketStatus {
  const last = lastReceivedAt(params.prices);
  const silence = params.silenceMilliseconds ?? MARKET_SILENCE_MILLISECONDS;
  const seconds =
    last === undefined
      ? undefined
      : Math.max(0, Math.floor((params.now - last) / MILLISECONDS_PER_SECOND));
  if (params.streamStatus !== STREAM_STATUS.LIVE)
    return { state: 'offline', secondsWithoutData: seconds };
  if (last === undefined) return { state: 'waiting', secondsWithoutData: undefined };
  const isSilent = params.now - last > silence;
  const isSealed = [...params.prices.values()].every((price) => price.isStale);
  return { state: isSilent || isSealed ? 'stale' : 'live', secondsWithoutData: seconds };
}
