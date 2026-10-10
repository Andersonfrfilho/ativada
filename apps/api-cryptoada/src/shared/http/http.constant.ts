// Copyright (c) 2026 Ada Technology. All rights reserved.
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const HTTP_METHOD = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  OPTIONS: 'OPTIONS',
} as const;

export type HttpMethod = (typeof HTTP_METHOD)[keyof typeof HTTP_METHOD];

export const HTTP_HEADER = {
  ALLOW: 'Allow',
  AUTHORIZATION: 'Authorization',
  CACHE_CONTROL: 'Cache-Control',
  CONTENT_DISPOSITION: 'Content-Disposition',
  COOKIE: 'Cookie',
  FORWARDED_FOR: 'X-Forwarded-For',
  ORIGIN: 'Origin',
  REQUESTED_WITH: 'X-Requested-With',
  RETRY_AFTER: 'Retry-After',
  SET_COOKIE: 'Set-Cookie',
  TRACE_ID: 'X-Trace-Id',
  VARY: 'Vary',
  WWW_AUTHENTICATE: 'WWW-Authenticate',
} as const;

export const NO_STORE_CACHE_CONTROL = 'no-store';
