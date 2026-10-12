// Copyright (c) 2026 Ada Technology. All rights reserved.
export const SESSION_CLIENT_ID = 'ativada-session';
export const SESSION_COOKIE_NAME = '__Host-ativada_refresh';
export const REQUESTED_WITH_VALUE = 'fetch';
export const SESSION_PATH = '/v1/session';
export const SESSION_REFRESH_PATH = '/v1/session/refresh';
export const STREAM_TICKETS_PATH = '/v1/stream/tickets';
export const EXPECTED_AUDIENCE = 'ativada-api';
export const EXPECTED_COOKIE_ATTRIBUTES: readonly string[] = [
  'HttpOnly',
  'Secure',
  'SameSite=Strict',
  'Path=/',
];
