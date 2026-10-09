// Copyright (c) 2026 Ada Technology. All rights reserved.
export const UNIQUE_VIOLATION_SQLSTATE = '23505';

const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
const MAX_CAUSE_DEPTH = 4;

function readSqlState(error: object): string | undefined {
  for (const field of ['code', 'errno']) {
    const value: unknown = (error as Record<string, unknown>)[field];
    if (typeof value === 'string' && SQLSTATE_PATTERN.test(value)) return value;
  }
  return undefined;
}

// O DrizzleQueryError embrulha o erro do driver em `cause`; o SQLSTATE é a única parte segura de logar.
export function readPostgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;
    const sqlState = readSqlState(current);
    if (sqlState !== undefined) return sqlState;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return readPostgresErrorCode(error) === UNIQUE_VIOLATION_SQLSTATE;
}
