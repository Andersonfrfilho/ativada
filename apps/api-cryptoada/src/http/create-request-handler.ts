// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Logger } from '../logging/logger.js';
import type { Router } from '../router/create-router.js';
import { HTTP_HEADER } from '../shared/http/http.constant.js';
import { decorateResponse } from './decorate-response.js';
import { buildPreflightResponse, isPreflightRequest } from './preflight.js';

export type RequestHandlerDependencies = {
  readonly router: Router;
  readonly corsAllowedOrigins: readonly string[];
  readonly logger: Logger;
};

export type RequestHandler = (
  request: Request,
  socketAddress: string | undefined,
) => Promise<Response>;

export function createRequestHandler(dependencies: RequestHandlerDependencies): RequestHandler {
  const allowedOrigins = new Set(dependencies.corsAllowedOrigins);

  return async (request, socketAddress) => {
    const traceId = crypto.randomUUID();
    const startedAtMilliseconds = performance.now();
    const origin = request.headers.get(HTTP_HEADER.ORIGIN);
    const allowedOrigin = origin !== null && allowedOrigins.has(origin) ? origin : undefined;
    const response = isPreflightRequest(request)
      ? buildPreflightResponse(allowedOrigin !== undefined)
      : await dependencies.router({ request, socketAddress, traceId });
    dependencies.logger.info('request', {
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAtMilliseconds),
      traceId,
    });
    return decorateResponse({ response, allowedOrigin, traceId });
  };
}
