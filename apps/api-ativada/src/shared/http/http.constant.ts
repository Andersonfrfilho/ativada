// Copyright (c) 2026 Ada Technology. All rights reserved.
export { HTTP_METHOD, HTTP_STATUS, type HttpMethod } from '@ativada/environment';

export const HTTP_HEADER = {
  ALLOW: 'Allow',
  AUTHORIZATION: 'Authorization',
  CACHE_CONTROL: 'Cache-Control',
  CONTENT_DISPOSITION: 'Content-Disposition',
  CONTENT_LENGTH: 'Content-Length',
  CONTENT_TYPE: 'Content-Type',
  COOKIE: 'Cookie',
  FORWARDED_FOR: 'X-Forwarded-For',
  ORIGIN: 'Origin',
  REQUESTED_WITH: 'X-Requested-With',
  RETRY_AFTER: 'Retry-After',
  SET_COOKIE: 'Set-Cookie',
  TRACE_ID: 'X-Trace-Id',
  UPGRADE: 'Upgrade',
  VARY: 'Vary',
  WWW_AUTHENTICATE: 'WWW-Authenticate',
} as const;

export const NO_STORE_CACHE_CONTROL = 'no-store';
