// Copyright (c) 2026 Ada Technology. All rights reserved.
import { INTERNAL_ERROR_CODE } from '../errors/error-code.constant.js';
import type { AppError } from '../errors/app.error.js';
import { HTTP_HEADER, HTTP_STATUS, NO_STORE_CACHE_CONTROL } from './http.constant.js';

export type RouteResult = {
  readonly status: number;
  readonly data: unknown;
};

const INTERNAL_ERROR_MESSAGE = 'Erro interno. Tente novamente em instantes.';

export function buildSuccessResponse(result: RouteResult): Response {
  return Response.json(
    { data: result.data },
    { status: result.status, headers: { [HTTP_HEADER.CACHE_CONTROL]: NO_STORE_CACHE_CONTROL } },
  );
}

export function buildErrorResponse(error: AppError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message } },
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
