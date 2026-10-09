// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_HEADER, NO_STORE_CACHE_CONTROL } from '../shared/http/http.constant.js';
import { CORS_HEADER, CORS_EXPOSED_HEADERS, SECURITY_HEADERS } from './http-security.constant.js';

export type DecorateResponseParams = {
  readonly response: Response;
  readonly allowedOrigin: string | undefined;
  readonly traceId: string;
};

export function decorateResponse(params: DecorateResponseParams): Response {
  const { headers } = params.response;
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (!headers.has(HTTP_HEADER.CACHE_CONTROL)) {
    headers.set(HTTP_HEADER.CACHE_CONTROL, NO_STORE_CACHE_CONTROL);
  }
  headers.set(HTTP_HEADER.TRACE_ID, params.traceId);
  headers.append(HTTP_HEADER.VARY, HTTP_HEADER.ORIGIN);
  if (params.allowedOrigin !== undefined) {
    headers.set(CORS_HEADER.ALLOW_ORIGIN, params.allowedOrigin);
    headers.set(CORS_HEADER.ALLOW_CREDENTIALS, 'true');
    headers.set(CORS_HEADER.EXPOSE_HEADERS, CORS_EXPOSED_HEADERS);
  }
  return params.response;
}
