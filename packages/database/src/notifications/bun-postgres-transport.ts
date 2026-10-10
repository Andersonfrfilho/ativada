// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  OpenTransport,
  PostgresTransport,
  TlsUpgradeOptions,
  TransportEvents,
} from './postgres-transport.types.js';

type BunSocket = Bun.Socket<undefined>;

type TransportState = {
  socket: BunSocket | undefined;
  outbox: Uint8Array;
  isClosedByUs: boolean;
  isUpgraded: boolean;
};

function flushOutbox(state: TransportState): void {
  const { socket } = state;
  if (socket === undefined || state.outbox.length === 0) return;
  const written = socket.write(state.outbox);
  state.outbox = state.outbox.slice(Math.max(written, 0));
}

function enqueue(state: TransportState, bytes: Uint8Array): void {
  const joined = new Uint8Array(state.outbox.length + bytes.length);
  joined.set(state.outbox, 0);
  joined.set(bytes, state.outbox.length);
  state.outbox = joined;
  flushOutbox(state);
}

function notifyClose(state: TransportState, events: TransportEvents): void {
  events.onClose(!state.isClosedByUs);
}

// Depois do `upgradeTLS` o soquete original continua recebendo os bytes cifrados: só o soquete TLS entrega dados.
function upgradeToTls(
  state: TransportState,
  events: TransportEvents,
  options: TlsUpgradeOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (state.socket === undefined) {
      reject(new Error('conexão fechada'));
      return;
    }
    // Desde já o soquete cru só carrega bytes cifrados do handshake: nada dele chega ao protocolo.
    state.isUpgraded = true;
    state.socket.upgradeTLS<undefined>({
      tls: { rejectUnauthorized: options.shouldVerify, serverName: options.serverName },
      socket: {
        handshake: (secure, isSuccessful, authorizationError) => {
          if (!isSuccessful || (options.shouldVerify && authorizationError !== null)) {
            reject(authorizationError ?? new Error('handshake TLS falhou'));
            return;
          }
          state.socket = secure;
          resolve();
        },
        data: (_secure, chunk) => events.onData(new Uint8Array(chunk)),
        drain: () => flushOutbox(state),
        close: () => notifyClose(state, events),
        error: () => undefined,
      },
    });
  });
}

export const openBunTransport: OpenTransport = async (params) => {
  const { events } = params;
  const state: TransportState = {
    socket: undefined,
    outbox: new Uint8Array(0),
    isClosedByUs: false,
    isUpgraded: false,
  };
  state.socket = await Bun.connect<undefined>({
    hostname: params.host,
    port: params.port,
    socket: {
      data: (_socket, chunk) => {
        if (!state.isUpgraded) events.onData(new Uint8Array(chunk));
      },
      drain: () => flushOutbox(state),
      close: () => {
        if (!state.isUpgraded) notifyClose(state, events);
      },
      error: () => undefined,
    },
  });
  const transport: PostgresTransport = {
    write: (bytes) => enqueue(state, bytes),
    upgradeToTls: (options) => upgradeToTls(state, events, options),
    close: () => {
      state.isClosedByUs = true;
      state.socket?.end();
    },
  };
  return transport;
};
