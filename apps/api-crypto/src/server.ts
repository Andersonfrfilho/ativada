// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RequestHandler } from './http/create-request-handler.js';

const MAX_REQUEST_BODY_BYTES = 1_048_576;

export type StartServerParams = {
  readonly handler: RequestHandler;
  readonly host: string;
  readonly port: number;
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
    fetch: (request, bunServer) => params.handler(request, bunServer.requestIP(request)?.address),
  });
  return { port: server.port ?? params.port, stop: () => server.stop() };
}
