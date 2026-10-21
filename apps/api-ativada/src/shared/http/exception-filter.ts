// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isDatabaseConnectionFailure } from '@ativada/database';

import { AppError } from '../errors/app.error.js';
import { DatabaseUnavailableApiError } from '../errors/database-unavailable.error.js';
import { buildErrorResponse, buildInternalErrorResponse } from './response-envelope.js';

export type ExceptionFilterParams = {
  readonly error: unknown;
  readonly traceId: string;
  readonly reportUnexpectedError: (error: unknown, traceId: string) => void;
  // Resume a queda no log (uma linha por minuto, só o código): o banco fora não é defeito e não vai ao relatório de erros.
  readonly reportDatabaseOutage?: ((error: unknown) => void) | undefined;
};

export function toErrorResponse(params: ExceptionFilterParams): Response {
  if (params.error instanceof AppError) return buildErrorResponse(params.error);
  if (isDatabaseConnectionFailure(params.error)) {
    params.reportDatabaseOutage?.(params.error);
    return buildErrorResponse(new DatabaseUnavailableApiError());
  }
  params.reportUnexpectedError(params.error, params.traceId);
  return buildInternalErrorResponse();
}
