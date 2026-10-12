// Copyright (c) 2026 Ada Technology. All rights reserved.
export const SESSION_PATH = '/v1/session';
export const SESSION_REFRESH_PATH = '/v1/session/refresh';

export const REFRESH_COOKIE_NAME = '__Host-ativada_refresh';
export const REFRESH_COOKIE_ATTRIBUTES: readonly string[] = [
  'HttpOnly',
  'Secure',
  'SameSite=Strict',
  'Path=/',
];
export const REFRESH_COOKIE_VALUE_PATTERN = /^[A-Za-z0-9._~-]+$/;

export const REQUIRED_REQUESTED_WITH = 'fetch';

export const REFRESH_DEDUPLICATION_WINDOW_MILLISECONDS = 10_000;
export const MAX_DEDUPLICATED_REFRESHES = 1_000;
export const KEYCLOAK_REQUEST_TIMEOUT_MILLISECONDS = 5_000;

export const CODE_MAX_LENGTH = 2_048;
export const REDIRECT_URI_MAX_LENGTH = 2_048;
export const CODE_VERIFIER_MIN_LENGTH = 43;
export const CODE_VERIFIER_MAX_LENGTH = 128;
export const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]+$/;

export const OAUTH_FIELD = {
  CLIENT_ID: 'client_id',
  CLIENT_SECRET: 'client_secret',
  CODE: 'code',
  CODE_VERIFIER: 'code_verifier',
  GRANT_TYPE: 'grant_type',
  REDIRECT_URI: 'redirect_uri',
  REFRESH_TOKEN: 'refresh_token',
} as const;

export const OAUTH_GRANT_TYPE = {
  AUTHORIZATION_CODE: 'authorization_code',
  REFRESH_TOKEN: 'refresh_token',
} as const;

export const TOKEN_GRANT_STATUS = {
  GRANTED: 'granted',
  REJECTED: 'rejected',
  UNAVAILABLE: 'unavailable',
} as const;

export const REVOCATION_STATUS = {
  REVOKED: 'revoked',
  UNAVAILABLE: 'unavailable',
} as const;

export const REFRESH_OUTCOME_STATUS = {
  RENEWED: 'renewed',
  UNVERIFIABLE: 'unverifiable',
  ENDED: 'ended',
  UNAVAILABLE: 'unavailable',
} as const;
