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

// Uma conexão, do pedido ao fim: o vigia de silêncio cobre também a conexão que nunca abre.
export function openKlineConnection(params: ConnectionParams): OpenConnection {
  const { socket } = createSocket(params);
  let openedAt: number | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let settle: (end: ConnectionEnd) => void = () => undefined;
  const ended = new Promise<ConnectionEnd>((resolve) => {
    settle = resolve;
  });

  function finish(reason: DisconnectReason): void {
    clearTimeout(watchdog);
    if (socket !== undefined) {
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
    settle({ reason, openedAt });
  }

  function armWatchdog(): void {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => finish(DISCONNECT_REASON.STALE), params.staleAfterMilliseconds);
  }

  if (socket === undefined) {
    finish(DISCONNECT_REASON.CONNECTION_FAILED);
    return { ended, abort: () => undefined };
  }
  socket.onopen = (): void => {
    openedAt = params.now();
    armWatchdog();
    params.onOpen();
  };
  socket.onmessage = (event): void => {
    armWatchdog();
    params.onData(event.data);
  };
  // O fechamento sempre vem depois do erro e é ele quem decide o motivo.
  socket.onerror = (): void => undefined;
  socket.onclose = (): void => {
    finish(
      openedAt === undefined
        ? DISCONNECT_REASON.CONNECTION_FAILED
        : DISCONNECT_REASON.SERVER_CLOSED,
    );
  };
  armWatchdog();
  return { ended, abort: () => finish(DISCONNECT_REASON.CLOSED_BY_CONSUMER) };
}
