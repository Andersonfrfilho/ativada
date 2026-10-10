// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CancellableSleep } from './cancellable-sleep.js';
import {
  openKlineConnection,
  type ConnectionEnd,
  type OpenConnection,
} from './kline-stream-connection.js';
import type {
  KlineStreamCounters,
  StreamDispatcher,
  StreamLifecycle,
} from './kline-stream-dispatcher.js';
import { computeBackoffDelay } from './reconnect-backoff.js';
import type { ResolvedStreamSettings } from './resolve-stream-settings.js';

// O que o laço de reconexão lê: o stream de klines e o de ticker o compartilham.
export type ReconnectConfig = Pick<
  ResolvedStreamSettings,
  | 'url'
  | 'staleAfterMilliseconds'
  | 'reconnectBaseMilliseconds'
  | 'reconnectMaxMilliseconds'
  | 'stableAfterMilliseconds'
>;

export type ReconnectCounters = Pick<KlineStreamCounters, 'attemptCount' | 'loopFailureCount'>;

export type ReconnectLoopParams = {
  readonly config: ReconnectConfig;
  readonly counters: ReconnectCounters;
  readonly lifecycle: StreamLifecycle;
  readonly dispatcher: StreamDispatcher;
  readonly cancellable: CancellableSleep;
  readonly now: () => number;
  readonly random: () => number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly webSocketFactory: (url: string) => WebSocket;
};

export type ReconnectLoop = {
  readonly done: Promise<void>;
  readonly stop: () => void;
};

type LoopContext = {
  readonly params: ReconnectLoopParams;
  readonly closedSignal: Promise<void>;
  consecutiveFailures: number;
  activeConnection: OpenConnection | undefined;
};

function isStable(context: LoopContext, end: ConnectionEnd): boolean {
  const { now, config } = context.params;
  return end.openedAt !== undefined && now() - end.openedAt >= config.stableAfterMilliseconds;
}

function connectOnce(context: LoopContext): Promise<ConnectionEnd> {
  const { config, counters, dispatcher, now, webSocketFactory } = context.params;
  counters.attemptCount += 1;
  context.activeConnection = openKlineConnection({
    url: config.url,
    webSocketFactory,
    staleAfterMilliseconds: config.staleAfterMilliseconds,
    now,
    onOpen: dispatcher.handleOpen,
    onData: dispatcher.handleData,
  });
  return context.activeConnection.ended;
}

async function waitBeforeReconnect(context: LoopContext, end: ConnectionEnd): Promise<void> {
  const { config, random, sleep } = context.params;
  if (isStable(context, end)) context.consecutiveFailures = 0;
  const delay = computeBackoffDelay({
    attempt: context.consecutiveFailures,
    baseMilliseconds: config.reconnectBaseMilliseconds,
    maxMilliseconds: config.reconnectMaxMilliseconds,
    random,
  });
  context.consecutiveFailures += 1;
  await Promise.race([sleep(delay), context.closedSignal]);
}

async function connectAndWait(context: LoopContext): Promise<void> {
  const end = await connectOnce(context);
  if (context.params.lifecycle.isClosed) return;
  context.params.dispatcher.notifyDisconnected(end.reason);
  await waitBeforeReconnect(context, end);
}

// Falha inesperada do laço (ex.: `sleep` injetado que rejeita) vira contagem e nova tentativa, nunca rejeição solta.
async function runLoop(context: LoopContext): Promise<void> {
  const { lifecycle, counters, cancellable, config } = context.params;
  while (!lifecycle.isClosed) {
    try {
      await connectAndWait(context);
    } catch {
      counters.loopFailureCount += 1;
      await Promise.race([
        cancellable.sleep(config.reconnectMaxMilliseconds),
        context.closedSignal,
      ]);
    }
  }
}

export function createReconnectLoop(params: ReconnectLoopParams): ReconnectLoop {
  let notifyClosed: () => void = () => undefined;
  const closedSignal = new Promise<void>((resolve) => {
    notifyClosed = resolve;
  });
  const context: LoopContext = {
    params,
    closedSignal,
    consecutiveFailures: 0,
    activeConnection: undefined,
  };
  const done = runLoop(context);
  return {
    done,
    stop: (): void => {
      params.lifecycle.isClosed = true;
      notifyClosed();
      params.cancellable.cancelAll();
      context.activeConnection?.abort();
    },
  };
}
