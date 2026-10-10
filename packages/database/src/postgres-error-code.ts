// Copyright (c) 2026 Ada Technology. All rights reserved.
export const UNIQUE_VIOLATION_SQLSTATE = '23505';
export const FOREIGN_KEY_VIOLATION_SQLSTATE = '23503';
// O Postgres 18 sinaliza o RESTRICT de uma FK com 23001; as versões anteriores, com 23503.
export const RESTRICT_VIOLATION_SQLSTATE = '23001';

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

export function isForeignKeyViolation(error: unknown): boolean {
  return readPostgresErrorCode(error) === FOREIGN_KEY_VIOLATION_SQLSTATE;
}

export function isRestrictViolation(error: unknown): boolean {
  const sqlState = readPostgresErrorCode(error);
  return sqlState === RESTRICT_VIOLATION_SQLSTATE || sqlState === FOREIGN_KEY_VIOLATION_SQLSTATE;
}

const DRIZZLE_FAILED_QUERY_PREFIX = 'Failed query:';

function isDrizzleQueryFailure(error: object): boolean {
  const { message } = error as { message?: unknown };
  return typeof message === 'string' && message.startsWith(DRIZZLE_FAILED_QUERY_PREFIX);
}

// A mensagem e a `cause` de um erro de banco carregam o SQL e os parâmetros (PII): só o SQLSTATE sai.
export function isDatabaseError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return false;
    if (readSqlState(current) !== undefined || isDrizzleQueryFailure(current)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
