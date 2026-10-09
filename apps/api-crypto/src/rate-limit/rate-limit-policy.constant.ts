// Copyright (c) 2026 Ada Technology. All rights reserved.
export const RATE_LIMIT_KEY_SCOPE = {
  SUBJECT: 'subject',
  CLIENT_ADDRESS: 'client-address',
} as const;

export type RateLimitKeyScope = (typeof RATE_LIMIT_KEY_SCOPE)[keyof typeof RATE_LIMIT_KEY_SCOPE];

export type RateLimitPolicy = {
  readonly name: string;
  readonly limit: number;
  readonly windowMilliseconds: number;
  readonly keyScope: RateLimitKeyScope;
};

const ONE_MINUTE_MILLISECONDS = 60_000;

export const RATE_LIMIT_POLICY = {
  AUTHENTICATED_USER: {
    name: 'authenticated-user',
    limit: 120,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
  },
  EXECUTION_CREATION: {
    name: 'execution-creation',
    limit: 20,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
  },
  SESSION_CLIENT_ADDRESS: {
    name: 'session-client-address',
    limit: 10,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.CLIENT_ADDRESS,
  },
  UNAUTHENTICATED_CLIENT_ADDRESS: {
    name: 'unauthenticated-client-address',
    limit: 30,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.CLIENT_ADDRESS,
  },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;

export const MAX_TRACKED_RATE_LIMIT_KEYS = 10_000;
export const UNKNOWN_CLIENT_ADDRESS = 'unknown';
