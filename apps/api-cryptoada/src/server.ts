// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RequestHandler } from './http/create-request-handler.js';
import { buildInternalErrorResponse } from './shared/http/response-envelope.js';
import type { StreamEndpoint } from './stream/create-stream-endpoint.js';
import type { StreamSocketData } from './stream/stream-socket.types.js';

const MAX_REQUEST_BODY_BYTES = 1_048_576;

export type StartServerParams = {
  readonly handler: RequestHandler;
  readonly host: string;
  readonly port: number;
  readonly reportUnexpectedError: (error: unknown) => void;
  // `GET /v1/stream` vira WebSocket aqui, antes do roteador: o handshake tem a própria autenticação (ticket + Origin).
  readonly stream?: StreamEndpoint | undefined;
};

export type StartedServer = {
  readonly port: number;
  readonly stop: () => Promise<void>;
};

// Quanto a parada graciosa espera os clientes confirmarem o fechamento 1001 antes de derrubar o que sobrou: o `stop()` do
// Bun fica pendente enquanto houver socket aberto, e o encerramento tem prazo (`SHUTDOWN_TIMEOUT_MILLISECONDS`).
const WEBSOCKET_CLOSE_GRACE_MILLISECONDS = 2_000;

const NO_WEBSOCKET: Bun.WebSocketHandler<StreamSocketData> = { message: () => undefined };

export function startServer(params: StartServerParams): StartedServer {
  const { stream } = params;
  const server = Bun.serve<StreamSocketData>({
    hostname: params.host,
    port: params.port,
    maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
    // O modo de desenvolvimento do Bun devolve página HTML com a pilha; em qualquer ambiente a resposta é o envelope genérico.
    development: false,
    fetch: (request, bunServer): Promise<Response | undefined> | Promise<Response> => {
      const socketAddress = bunServer.requestIP(request)?.address;
      if (stream?.isStreamRequest(request) === true) {
        return stream.handleUpgrade({ request, server: bunServer, socketAddress });
      }
      return params.handler(request, socketAddress);
    },
    websocket: stream?.websocket ?? NO_WEBSOCKET,
    error: (error): Response => {
      params.reportUnexpectedError(error);
      return buildInternalErrorResponse();
    },
  });
  return {
    port: server.port ?? params.port,
    // Os sockets abertos saem com 1001 antes de o servidor parar de ouvir; o que não responder ao fechamento é derrubado.
    stop: async (): Promise<void> => {
      stream?.closeAll();
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      const grace = new Promise<void>((resolve) => {
        graceTimer = setTimeout(resolve, WEBSOCKET_CLOSE_GRACE_MILLISECONDS);
      });
      await Promise.race([server.stop(), grace]);
      clearTimeout(graceTimer);
      void server.stop(true);
    },
  };
}
