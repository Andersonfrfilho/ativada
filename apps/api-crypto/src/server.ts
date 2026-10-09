// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RequestHandler } from './http/create-request-handler.js';
import { buildInternalErrorResponse } from './shared/http/response-envelope.js';

const MAX_REQUEST_BODY_BYTES = 1_048_576;

export type StartServerParams = {
  readonly handler: RequestHandler;
  readonly host: string;
  readonly port: number;
  readonly reportUnexpectedError: (error: unknown) => void;
};

export type StartedServer = {
  readonly port: number;
  readonly stop: () => Promise<void>;
};

export function startServer(params: StartServerParams): StartedServer {
  const server = Bun.serve({
    hostname: params.host,
    port: params.port,
    maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
    // O modo de desenvolvimento do Bun devolve página HTML com a pilha; em qualquer ambiente a resposta é o envelope genérico.
    development: false,
    fetch: (request, bunServer) => params.handler(request, bunServer.requestIP(request)?.address),
    error: (error) => {
      params.reportUnexpectedError(error);
      return buildInternalErrorResponse();
    },
  });
  return { port: server.port ?? params.port, stop: () => server.stop() };
}
