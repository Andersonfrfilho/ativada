// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DisconnectReason, MalformedReason } from '../kline-stream.types.js';

// O que o `<par>@miniTicker` da Binance diz: o preço corrente, o de abertura da janela de 24 h e o instante do evento.
// Preços ficam em texto decimal, como chegam: nenhuma conta de dinheiro passa por `number`.
export type RawTick = {
  readonly symbol: string;
  readonly price: string;
  readonly openPrice: string;
  readonly eventTime: number;
};

type MaybePromise = void | Promise<void>;

export type TickerStreamSettings = {
  readonly symbols: readonly string[];
  readonly baseUrl?: string | undefined;
  readonly staleAfterMilliseconds?: number | undefined;
  readonly reconnectBaseMilliseconds?: number | undefined;
  readonly reconnectMaxMilliseconds?: number | undefined;
  readonly stableAfterMilliseconds?: number | undefined;
  readonly now?: (() => number) | undefined;
  readonly sleep?: ((milliseconds: number) => Promise<void>) | undefined;
  readonly random?: (() => number) | undefined;
  readonly webSocketFactory?: ((url: string) => WebSocket) | undefined;
  readonly onTick: (tick: RawTick) => MaybePromise;
  readonly onConnected?: ((event: { readonly attempt: number }) => MaybePromise) | undefined;
  readonly onDisconnected?:
    ((event: { readonly reason: DisconnectReason }) => MaybePromise) | undefined;
  readonly onMalformed?:
    | ((event: { readonly reason: MalformedReason; readonly count: number }) => MaybePromise)
    | undefined;
};

export type TickerStreamStats = {
  readonly attemptCount: number;
  readonly deliveredCount: number;
  readonly malformedCount: number;
  readonly handlerFailureCount: number;
  readonly loopFailureCount: number;
};

export type TickerStream = {
  readonly close: () => Promise<void>;
  readonly stats: () => TickerStreamStats;
};
