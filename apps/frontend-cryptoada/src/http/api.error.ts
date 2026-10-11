// Copyright (c) 2026 Ada Technology. All rights reserved.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(params: {
    readonly status: number;
    readonly code: string;
    readonly message: string;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code;
  }
}

export class ResponseShapeError extends Error {
  constructor(path: string) {
    super(`A resposta de ${path} não tem o formato esperado.`);
    this.name = 'ResponseShapeError';
  }
}
