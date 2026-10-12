// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CLOSE_REASON, WEBSOCKET_CLOSE_CODE } from './stream.constant.js';
import type { StreamHub } from './stream-hub.js';
import type { StreamSocket } from './stream-socket.types.js';

export type SweepParams = {
  readonly hub: StreamHub;
  readonly nowMilliseconds: number;
  readonly pongTimeoutMilliseconds: number;
};

function sweepSocket(socket: StreamSocket, params: SweepParams): void {
  const { data } = socket;
  const { nowMilliseconds } = params;
  if (nowMilliseconds >= data.expiresAtMilliseconds) {
    socket.close(WEBSOCKET_CLOSE_CODE.TOKEN_EXPIRED, CLOSE_REASON.TOKEN_EXPIRED);
  } else if (nowMilliseconds - data.lastActivityAtMilliseconds >= params.pongTimeoutMilliseconds) {
    socket.close(WEBSOCKET_CLOSE_CODE.PONG_TIMEOUT, CLOSE_REASON.PONG_TIMEOUT);
  } else {
    socket.ping();
  }
}

// Uma passada: o token que venceu fecha com 4401 (a menos que o painel tenha renovado dentro do socket), o que parou de
// responder ao ping fecha com 4408 e os demais recebem um ping novo. Cada socket é tratado por conta própria.
export function sweepStreamSockets(params: SweepParams): void {
  for (const socket of params.hub.allSockets()) {
    try {
      sweepSocket(socket, params);
    } catch {
      // Socket que quebrou no meio da passada sai pelo `close` do servidor; os outros seguem.
    }
  }
}
