// Copyright (c) 2026 Ada Technology. All rights reserved.
import { INTERNAL_ERROR_CODE } from '../errors/error-code.constant.js';
import type { AppError } from '../errors/app.error.js';
import { HTTP_HEADER, HTTP_STATUS, NO_STORE_CACHE_CONTROL } from './http.constant.js';

export type RouteResult = {
  readonly status: number;
  readonly data?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
};

const INTERNAL_ERROR_MESSAGE = 'Erro interno. Tente novamente em instantes.';

export function buildSuccessResponse(result: RouteResult): Response {
  const headers = { ...result.headers, [HTTP_HEADER.CACHE_CONTROL]: NO_STORE_CACHE_CONTROL };
  if (result.status === HTTP_STATUS.NO_CONTENT) return new Response(null, { status: 204, headers });
  return Response.json({ data: result.data }, { status: result.status, headers });
}

export function buildErrorResponse(error: AppError): Response {
  const detailsField = error.details.length > 0 ? { details: error.details } : {};
  return Response.json(
    { error: { code: error.code, message: error.message, ...detailsField } },
    {
      status: error.status,
      headers: { ...error.headers, [HTTP_HEADER.CACHE_CONTROL]: NO_STORE_CACHE_CONTROL },
    },
  );
}

export function buildInternalErrorResponse(): Response {
  return Response.json(
    { error: { code: INTERNAL_ERROR_CODE, message: INTERNAL_ERROR_MESSAGE } },
    {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      headers: { [HTTP_HEADER.CACHE_CONTROL]: NO_STORE_CACHE_CONTROL },
    },
  );
}
