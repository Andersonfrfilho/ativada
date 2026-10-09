// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_METHOD } from '../shared/http/http.constant.js';
import { buildErrorResponse } from '../shared/http/response-envelope.js';
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_HEADER,
  CORS_PREFLIGHT_MAX_AGE_SECONDS,
} from './http-security.constant.js';
import { OriginNotAllowedError } from './origin-not-allowed.error.js';

export function isPreflightRequest(request: Request): boolean {
  return (
    request.method === HTTP_METHOD.OPTIONS &&
    request.headers.has('Origin') &&
    request.headers.has(CORS_HEADER.REQUEST_METHOD)
  );
}

export function buildPreflightResponse(isOriginAllowed: boolean): Response {
  if (!isOriginAllowed) return buildErrorResponse(new OriginNotAllowedError());
  return new Response(null, {
    status: 204,
    headers: {
      [CORS_HEADER.ALLOW_METHODS]: CORS_ALLOWED_METHODS,
      [CORS_HEADER.ALLOW_HEADERS]: CORS_ALLOWED_HEADERS,
      [CORS_HEADER.MAX_AGE]: CORS_PREFLIGHT_MAX_AGE_SECONDS,
    },
  });
}
