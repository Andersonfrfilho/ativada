// Copyright (c) 2026 Ada Technology. All rights reserved.
export type ApiErrorDetail = { readonly field: string; readonly reason: string };

export type ApiErrorParams = {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: readonly ApiErrorDetail[];
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly ApiErrorDetail[];

  constructor(params: ApiErrorParams) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
    this.details = params.details ?? [];
  }
}

export class ResponseShapeError extends Error {
  constructor(path: string) {
    super(`A resposta de ${path} não tem o formato esperado.`);
    this.name = 'ResponseShapeError';
  }
}
