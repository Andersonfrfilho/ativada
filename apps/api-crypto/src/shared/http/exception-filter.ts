// Copyright (c) 2026 Ada Technology. All rights reserved.
import { AppError } from '../errors/app.error.js';
import { buildErrorResponse, buildInternalErrorResponse } from './response-envelope.js';

export type ExceptionFilterParams = {
  readonly error: unknown;
  readonly traceId: string;
  readonly reportUnexpectedError: (error: unknown, traceId: string) => void;
};

export function toErrorResponse(params: ExceptionFilterParams): Response {
  if (params.error instanceof AppError) return buildErrorResponse(params.error);
  params.reportUnexpectedError(params.error, params.traceId);
  return buildInternalErrorResponse();
}
