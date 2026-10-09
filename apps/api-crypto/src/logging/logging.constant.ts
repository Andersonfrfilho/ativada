// Copyright (c) 2026 Ada Technology. All rights reserved.
export const REDACTED_VALUE = '[REDACTED]';
export const TRUNCATED_VALUE = '[TRUNCATED]';
export const CIRCULAR_VALUE = '[CIRCULAR]';
export const MAX_LOG_DEPTH = 6;
export const DATABASE_ERROR_LOG_NAME = 'DatabaseError';

export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'email',
  'telegramchatid',
  'ticket',
  'code',
  'codeverifier',
  'authorization',
  'cookie',
  'setcookie',
  'secret',
]);

export const SENSITIVE_KEY_FRAGMENTS: readonly string[] = ['secret', 'password', 'token', 'chatid'];

export const LOG_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];
