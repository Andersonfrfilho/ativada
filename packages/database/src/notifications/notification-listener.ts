// Copyright (c) 2026 Ada Technology. All rights reserved.
import { openBunTransport } from './bun-postgres-transport.js';
import { startListenSession } from './listen-session.js';
import type { ListenSession } from './listen-session.types.js';
import { parseConnectionUrl } from './parse-connection-url.js';
import type { OpenTransport } from './postgres-transport.types.js';
import { SESSION_END_REASON, type SessionEnd } from './session-end.js';

const CHANNEL_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const DEFAULT_RECONNECT_BASE_MILLISECONDS = 1_000;
const DEFAULT_RECONNECT_MAX_MILLISECONDS = 30_000;
const DEFAULT_KEEP_ALIVE_MILLISECONDS = 30_000;

export type ListeningEvent = { readonly attempt: number; readonly isReconnect: boolean };

export type NotificationListenerSettings = {
  readonly databaseUrl: string;
  readonly channel: string;
  readonly onNotification: (payload: string) => void;
  readonly onListening: (event: ListeningEvent) => void;
  // Toda sessão que termina sem ter sido pedida: `wasListening` diz se havia LISTEN ativo.
  readonly onLost: (end: SessionEnd) => void;
  readonly onHandlerError?: ((error: unknown) => void) | undefined;
  readonly openTransport?: OpenTransport | undefined;
  readonly reconnectBaseMilliseconds?: number | undefined;
  readonly reconnectMaxMilliseconds?: number | undefined;
  readonly keepAliveMilliseconds?: number | undefined;
  readonly random?: (() => number) | undefined;
  readonly sleep?: ((milliseconds: number) => Promise<void>) | undefined;
};

export type NotificationListener = {
  // Resolve no primeiro LISTEN confirmado (ou no `close`); nunca rejeita: a conexão é refeita até dar certo.
  readonly ready: Promise<void>;
  readonly isListening: () => boolean;
  readonly close: () => Promise<void>;
};

export class InvalidChannelError extends Error {
  constructor() {
    super('Canal de notificação inválido (letras minúsculas, dígitos e _, até 63 caracteres).');
    this.name = 'InvalidChannelError';
  }
}

export { SESSION_END_REASON };

type LoopState = {
  readonly settings: NotificationListenerSettings;
  readonly connection: ReturnType<typeof parseConnectionUrl>;
  readonly closedSignal: Promise<void>;
  readonly releaseReady: () => void;
  isClosed: boolean;
  isListening: boolean;
  hasListenedBefore: boolean;
  attempt: number;
  consecutiveFailures: number;
  session: ListenSession | undefined;
  cancelWait: () => void;
};

function guarded(state: LoopState, action: () => void): void {
  try {
    action();
  } catch (error: unknown) {
    state.settings.onHandlerError?.(error);
  }
}

function runSession(state: LoopState): Promise<SessionEnd> {
  const { settings } = state;
  state.attempt += 1;
  const attempt = state.attempt;
  return new Promise<SessionEnd>((resolve) => {
    const timers: { keepAlive: ReturnType<typeof setInterval> | undefined } = {
      keepAlive: undefined,
    };
    const session = startListenSession({
      settings: state.connection,
      channel: settings.channel,
      openTransport: settings.openTransport ?? openBunTransport,
      handlers: {
        onNotification: (payload) => guarded(state, () => settings.onNotification(payload)),
        onListening: () => {
          state.isListening = true;
          state.consecutiveFailures = 0;
          const isReconnect = state.hasListenedBefore;
          state.hasListenedBefore = true;
          state.releaseReady();
          guarded(state, () => settings.onListening({ attempt, isReconnect }));
        },
        onEnded: (end) => {
          clearInterval(timers.keepAlive);
          state.isListening = false;
          resolve(end);
        },
      },
    });
    state.session = session;
    timers.keepAlive = setInterval(() => {
      if (!session.checkAlive()) session.stop(SESSION_END_REASON.UNRESPONSIVE);
    }, settings.keepAliveMilliseconds ?? DEFAULT_KEEP_ALIVE_MILLISECONDS);
  });
}

function backoffDelay(state: LoopState): number {
  const { settings } = state;
  const base = settings.reconnectBaseMilliseconds ?? DEFAULT_RECONNECT_BASE_MILLISECONDS;
  const max = settings.reconnectMaxMilliseconds ?? DEFAULT_RECONNECT_MAX_MILLISECONDS;
  const capped = Math.min(base * 2 ** state.consecutiveFailures, max);
  const random = settings.random ?? Math.random;
  state.consecutiveFailures += 1;
  return Math.round(capped / 2 + (capped / 2) * random());
}

function wait(state: LoopState, milliseconds: number): Promise<void> {
  const { sleep } = state.settings;
  if (sleep !== undefined) return Promise.race([sleep(milliseconds), state.closedSignal]);
  return new Promise<void>((resolve): void => {
    const timer = setTimeout(resolve, milliseconds);
    state.cancelWait = (): void => {
      clearTimeout(timer);
      resolve();
    };
  });
}

async function runLoop(state: LoopState): Promise<void> {
  while (!state.isClosed) {
    const end = await runSession(state);
    state.session = undefined;
    if (state.isClosed) return;
    guarded(state, () => state.settings.onLost(end));
    await wait(state, backoffDelay(state));
  }
}

export function createNotificationListener(
  settings: NotificationListenerSettings,
): NotificationListener {
  if (!CHANNEL_PATTERN.test(settings.channel)) throw new InvalidChannelError();
  let releaseReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    releaseReady = resolve;
  });
  let signalClosed: () => void = () => undefined;
  const closedSignal = new Promise<void>((resolve) => {
    signalClosed = resolve;
  });
  const state: LoopState = {
    settings,
    connection: parseConnectionUrl(settings.databaseUrl),
    closedSignal,
    releaseReady,
    isClosed: false,
    isListening: false,
    hasListenedBefore: false,
    attempt: 0,
    consecutiveFailures: 0,
    session: undefined,
    cancelWait: () => undefined,
  };
  const done = runLoop(state);
  return {
    ready,
    isListening: () => state.isListening,
    close: async (): Promise<void> => {
      state.isClosed = true;
      state.session?.stop();
      state.cancelWait();
      signalClosed();
      releaseReady();
      await done;
    },
  };
}
