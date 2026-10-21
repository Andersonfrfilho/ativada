// Copyright (c) 2026 Ada Technology. All rights reserved.
export type ApiErrorDetail = { readonly field: string; readonly reason: string };

export type ApiErrorParams = {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: readonly ApiErrorDetail[];
  // Os segundos do cabeçalho Retry-After (429), quando o servidor os informa.
  readonly retryAfterSeconds?: number | undefined;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly ApiErrorDetail[];
  readonly retryAfterSeconds: number | undefined;

  constructor(params: ApiErrorParams) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details ?? [];
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

export class ResponseShapeError extends Error {
  constructor(path: string) {
    super(`A resposta de ${path} não tem o formato esperado.`);
    this.name = 'ResponseShapeError';
  }
}
