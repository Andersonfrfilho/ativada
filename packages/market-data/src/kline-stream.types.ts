// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Candle } from './candle.types.js';
import type { DISCONNECT_REASON, MALFORMED_REASON } from './kline-stream.constant.js';
import type { Timeframe } from './timeframe.constant.js';

export type DisconnectReason = (typeof DISCONNECT_REASON)[keyof typeof DISCONNECT_REASON];
export type MalformedReason = (typeof MALFORMED_REASON)[keyof typeof MALFORMED_REASON];

export type KlineStreamConnected = {
  // Contador 1-based de tentativas de conexão desde a criação, inclusive as que falharam.
  readonly attempt: number;
};
export type KlineStreamDisconnected = { readonly reason: DisconnectReason };
export type KlineStreamMalformed = { readonly reason: MalformedReason; readonly count: number };

type MaybePromise = void | Promise<void>;

export type KlineStreamSettings = {
  readonly symbols: readonly string[];
  readonly timeframes: readonly Timeframe[];
  readonly baseUrl?: string | undefined;
  readonly staleAfterMilliseconds?: number | undefined;
  readonly reconnectBaseMilliseconds?: number | undefined;
  readonly reconnectMaxMilliseconds?: number | undefined;
  readonly stableAfterMilliseconds?: number | undefined;
  readonly now?: (() => number) | undefined;
  readonly sleep?: ((milliseconds: number) => Promise<void>) | undefined;
  readonly random?: (() => number) | undefined;
  readonly webSocketFactory?: ((url: string) => WebSocket) | undefined;
  readonly onCandle: (candle: Candle) => MaybePromise;
  readonly onConnected?: ((event: KlineStreamConnected) => MaybePromise) | undefined;
  readonly onDisconnected?: ((event: KlineStreamDisconnected) => MaybePromise) | undefined;
  readonly onMalformed?: ((event: KlineStreamMalformed) => MaybePromise) | undefined;
};

export type KlineStreamStats = {
  readonly attemptCount: number;
  readonly deliveredCount: number;
  readonly ignoredOpenCount: number;
  readonly malformedCount: number;
  readonly handlerFailureCount: number;
};

export type KlineStream = {
  readonly close: () => Promise<void>;
  readonly stats: () => KlineStreamStats;
};
