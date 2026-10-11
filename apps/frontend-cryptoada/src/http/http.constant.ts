// Copyright (c) 2026 Ada Technology. All rights reserved.
export const HTTP_HEADER = {
  ACCEPT: 'Accept',
  AUTHORIZATION: 'Authorization',
  CONTENT_DISPOSITION: 'Content-Disposition',
  CONTENT_TYPE: 'Content-Type',
  REQUESTED_WITH: 'X-Requested-With',
} as const;

// Defesa de CSRF da API: o painel manda este valor fixo em toda chamada (ADR 0001 §a).
export const REQUESTED_WITH_VALUE = 'fetch';
export const JSON_CONTENT_TYPE = 'application/json';
export const BEARER_PREFIX = 'Bearer';

export const UNKNOWN_ERROR_CODE = 'UNKNOWN_ERROR';
export const DEFAULT_DOWNLOAD_NAME = 'download';
export const FILE_NAME_PATTERN = /filename="([^"]+)"/;

export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
