// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AggregatedTick, PriceTickListener, RawTick } from '@cryptoada/market-data';

import type { StreamSocket } from '../stream/stream-socket.types.js';
import type { MarketPubSub } from './market-pubsub.js';

export type MarketPublisherSettings<TTimer> = {
  readonly pairs: readonly string[];
  readonly maxPairsPerSocket: number;
  // Sem tick há este tempo, o dado é velho (selo `stale`).
  readonly staleAfterMilliseconds: number;
  readonly now: () => number;
  // A hora da Binance: o relógio local corrigido pelo desvio já medido (`createServerClock`).
  readonly serverTime: () => number;
  readonly setTimer: (callback: () => void, milliseconds: number) => TTimer;
  readonly clearTimer: (timer: TTimer) => void;
  readonly reportError: (error: unknown) => void;
};

export type MarketSubscriptions = {
  // Valida TODOS os pares antes de assinar (tudo ou nada); erro tipado em `MarketSubscriptionError`.
  readonly subscribe: (socket: StreamSocket, pairs: readonly string[]) => void;
  readonly unsubscribe: (socket: StreamSocket, pairs: readonly string[]) => void;
  readonly removeSocket: (socket: StreamSocket) => void;
};

export type MarketPublisher = {
  readonly subscriptions: MarketSubscriptions;
  readonly handleRawTick: (tick: RawTick) => void;
  // Ponto de extensão da Fase 4b: recebe CADA tick agregado uma vez; devolve a função que o remove.
  readonly addListener: (listener: PriceTickListener) => () => void;
  readonly sweepStale: () => void;
  // Quantos sockets assinam o par (para a saúde e para os testes).
  readonly subscriberCount: (pair: string) => number;
  readonly close: () => void;
};

export type PairState = {
  aggregated: AggregatedTick | undefined;
  lastReceivedAt: number;
  isStaleSent: boolean;
};

// O que as funções do publicador compartilham: nada fora daqui é estado.
export type MarketContext = {
  readonly pairs: ReadonlySet<string>;
  readonly pubsub: MarketPubSub;
  readonly states: Map<string, PairState>;
  readonly listeners: Set<PriceTickListener>;
  readonly now: () => number;
  readonly serverTime: () => number;
  readonly staleAfterMilliseconds: number;
  readonly maxPairsPerSocket: number;
  readonly reportError: (error: unknown) => void;
  isClosed: boolean;
};
