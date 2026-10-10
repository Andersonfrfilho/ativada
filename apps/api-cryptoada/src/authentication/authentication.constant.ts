// Copyright (c) 2026 Ada Technology. All rights reserved.
export const JWKS_CACHE_MAX_AGE_MILLISECONDS = 600_000;
export const JWKS_COOLDOWN_MILLISECONDS = 30_000;
export const JWKS_TIMEOUT_MILLISECONDS = 3_000;

export const ACCEPTED_ALGORITHMS: readonly string[] = ['RS256'];
export const REQUIRED_CLAIMS: readonly string[] = ['sub', 'exp', 'iat', 'iss', 'aud'];
export const CLOCK_TOLERANCE_SECONDS = 10;
export const MAX_TOKEN_AGE = '15m';
export const BEARER_TOKEN_TYPE = 'Bearer';
export const SUBJECT_MAX_LENGTH = 255;
export const RECENT_AUTHENTICATION_MAX_AGE_SECONDS = 300;
export const AUTHORIZATION_HEADER_MAX_LENGTH = 8192;

export const WWW_AUTHENTICATE_BEARER = 'Bearer';
export const WWW_AUTHENTICATE_INVALID_TOKEN = 'Bearer error="invalid_token"';

export const AUTHENTICATION_LEVEL = {
  PASSWORD: 1,
  MULTI_FACTOR: 2,
} as const;

export type AuthenticationLevel = (typeof AUTHENTICATION_LEVEL)[keyof typeof AUTHENTICATION_LEVEL];

export const MULTI_FACTOR_ACR_VALUES: ReadonlySet<string> = new Set(['2', 'mfa']);

export const JOSE_EXPIRED_CODE = 'ERR_JWT_EXPIRED';
export const JOSE_REJECTION_CODES: ReadonlySet<string> = new Set([
  JOSE_EXPIRED_CODE,
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWS_INVALID',
  'ERR_JWT_INVALID',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
  'ERR_JOSE_NOT_SUPPORTED',
]);

export const TOKEN_VERIFICATION_STATUS = {
  AUTHENTICATED: 'authenticated',
  REJECTED: 'rejected',
  UNAVAILABLE: 'unavailable',
} as const;

export const REJECTION_REASON = {
  EXPIRED: 'expired',
  INVALID: 'invalid',
} as const;

export type RejectionReason = (typeof REJECTION_REASON)[keyof typeof REJECTION_REASON];
