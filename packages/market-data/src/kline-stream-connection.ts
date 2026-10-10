// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DISCONNECT_REASON } from './kline-stream.constant.js';
import type { DisconnectReason } from './kline-stream.types.js';

export type ConnectionEnd = {
  readonly reason: DisconnectReason;
  readonly openedAt: number | undefined;
};

export type OpenConnection = {
  readonly ended: Promise<ConnectionEnd>;
  readonly abort: () => void;
};

export type ConnectionParams = {
  readonly url: string;
  readonly webSocketFactory: (url: string) => WebSocket;
  readonly staleAfterMilliseconds: number;
  readonly now: () => number;
  readonly onOpen: () => void;
  readonly onData: (data: unknown) => void;
};

type SocketOutcome = { readonly socket: WebSocket | undefined };

function createSocket(params: ConnectionParams): SocketOutcome {
  try {
    return { socket: params.webSocketFactory(params.url) };
  } catch {
    return { socket: undefined };
  }
}

type ConnectionState = {
  readonly socket: WebSocket | undefined;
  openedAt: number | undefined;
  watchdog: ReturnType<typeof setTimeout> | undefined;
  settle: (end: ConnectionEnd) => void;
};

function detachSocket(socket: WebSocket): void {
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  try {
    socket.close();
  } catch {
    // Socket já fechado: nada a liberar.
  }
}

function finish(state: ConnectionState, reason: DisconnectReason): void {
  clearTimeout(state.watchdog);
  if (state.socket !== undefined) detachSocket(state.socket);
  state.settle({ reason, openedAt: state.openedAt });
}

function armWatchdog(state: ConnectionState, params: ConnectionParams): void {
  clearTimeout(state.watchdog);
  state.watchdog = setTimeout(
    () => finish(state, DISCONNECT_REASON.STALE),
    params.staleAfterMilliseconds,
  );
}

function attachHandlers(socket: WebSocket, state: ConnectionState, params: ConnectionParams): void {
  socket.onopen = (): void => {
    state.openedAt = params.now();
    armWatchdog(state, params);
    params.onOpen();
  };
  socket.onmessage = (event): void => {
    armWatchdog(state, params);
    params.onData(event.data);
  };
  // O fechamento sempre vem depois do erro e é ele quem decide o motivo.
  socket.onerror = (): void => undefined;
  socket.onclose = (): void => {
    finish(
      state,
      state.openedAt === undefined
        ? DISCONNECT_REASON.CONNECTION_FAILED
        : DISCONNECT_REASON.SERVER_CLOSED,
    );
  };
}

// Uma conexão, do pedido ao fim: o vigia de silêncio cobre também a conexão que nunca abre.
export function openKlineConnection(params: ConnectionParams): OpenConnection {
  const state: ConnectionState = {
    socket: createSocket(params).socket,
    openedAt: undefined,
    watchdog: undefined,
    settle: () => undefined,
  };
  const ended = new Promise<ConnectionEnd>((resolve) => {
    state.settle = resolve;
  });
  if (state.socket === undefined) {
    finish(state, DISCONNECT_REASON.CONNECTION_FAILED);
    return { ended, abort: () => undefined };
  }
  attachHandlers(state.socket, state, params);
  armWatchdog(state, params);
  return { ended, abort: () => finish(state, DISCONNECT_REASON.CLOSED_BY_CONSUMER) };
}
