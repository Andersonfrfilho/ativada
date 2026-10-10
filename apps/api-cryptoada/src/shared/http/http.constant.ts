// Copyright (c) 2026 Ada Technology. All rights reserved.
export { HTTP_METHOD, HTTP_STATUS, type HttpMethod } from '@cryptoada/environment';

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
