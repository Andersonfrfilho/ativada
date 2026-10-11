// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CLOSE_REASON,
  STREAM_LOG_EVENT,
  WEBSOCKET_BACKPRESSURE_LIMIT_BYTES,
  WEBSOCKET_CLOSE_CODE,
} from './stream.constant.js';
import { handleStreamMessage, type MessageDependencies } from './handle-stream-message.js';
import type { StreamHub } from './stream-hub.js';
import type { StreamSocketData } from './stream-socket.types.js';

export type StreamLog = (fields: Readonly<Record<string, unknown>>) => void;

export type WebSocketHandlerDependencies = {
  readonly hub: StreamHub;
  readonly messages: MessageDependencies;
  readonly maxMessageBytes: number;
  readonly log: StreamLog;
};

// O que a conexão ganha ao abrir e perde ao fechar, no formato do `Bun.serve`: `data` é o que o upgrade deixou.
export function createStreamWebSocketHandler(
  dependencies: WebSocketHandlerDependencies,
): Bun.WebSocketHandler<StreamSocketData> {
  const { hub, messages, log } = dependencies;
  return {
    maxPayloadLength: dependencies.maxMessageBytes,
    backpressureLimit: WEBSOCKET_BACKPRESSURE_LIMIT_BYTES,
    closeOnBackpressureLimit: true,
    open: (socket): void => {
      // O teto também vale aqui: dois handshakes simultâneos do mesmo usuário passam juntos pela checagem do upgrade.
      if (hub.add(socket) === 'limit-reached') {
        socket.close(WEBSOCKET_CLOSE_CODE.POLICY_VIOLATION, CLOSE_REASON.LIMIT_REACHED);
        return;
      }
      log({ event: STREAM_LOG_EVENT.OPENED, connectionId: socket.data.connectionId });
    },
    message: (socket, message): void => handleStreamMessage(socket, message, messages),
    pong: (socket): void => {
      socket.data.lastActivityAtMilliseconds = messages.now();
    },
    close: (socket, code): void => {
      hub.remove(socket);
      messages.market?.removeSocket(socket);
      log({ event: STREAM_LOG_EVENT.CLOSED, connectionId: socket.data.connectionId, code });
    },
  };
}
