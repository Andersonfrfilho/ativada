// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isDatabaseError, readPostgresErrorCode } from '@crypto/database';

import {
  CIRCULAR_VALUE,
  DATABASE_ERROR_LOG_NAME,
  MAX_LOG_DEPTH,
  REDACTED_VALUE,
  SENSITIVE_KEYS,
  SENSITIVE_KEY_FRAGMENTS,
  TRUNCATED_VALUE,
} from './logging.constant.js';

type RedactionState = {
  readonly depth: number;
  readonly ancestors: ReadonlySet<object>;
};

export function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  if (SENSITIVE_KEYS.has(normalizedKey)) return true;
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment));
}

function redactEntries(
  entries: Iterable<readonly [string, unknown]>,
  state: RedactionState,
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, entryValue] of entries) {
    redacted[key] = isSensitiveKey(key) ? REDACTED_VALUE : redactValue(entryValue, state);
  }
  return redacted;
}

function describeError(error: Error, state: RedactionState): Record<string, unknown> {
  if (isDatabaseError(error)) {
    return { name: DATABASE_ERROR_LOG_NAME, code: readPostgresErrorCode(error) };
  }
  return redactEntries(
    [
      ['name', error.name],
      ['message', error.message],
      ['stack', error.stack],
    ],
    state,
  );
}

export function redactValue(value: unknown, state: RedactionState): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value !== 'object' || value === null) return value;
  if (state.ancestors.has(value)) return CIRCULAR_VALUE;
  if (state.depth >= MAX_LOG_DEPTH) return TRUNCATED_VALUE;
  const nextState: RedactionState = {
    depth: state.depth + 1,
    ancestors: new Set([...state.ancestors, value]),
  };
  if (value instanceof Error) return describeError(value, nextState);
  if (value instanceof Headers) return redactEntries(value.entries(), nextState);
  if (Array.isArray(value)) return value.map((item: unknown) => redactValue(item, nextState));
  return redactEntries(Object.entries(value), nextState);
}

export function redactFields(fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return redactEntries(Object.entries(fields), { depth: 0, ancestors: new Set([fields]) });
}
