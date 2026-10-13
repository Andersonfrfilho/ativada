// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  MAX_ERROR_CAUSE_DEPTH,
  UNKNOWN_ERROR_CODE,
  UNKNOWN_ERROR_NAME,
} from './connection.constant.js';

// Só o que pode sair num log: nome, código do driver e SQLSTATE. Nunca a mensagem, que traz consulta, parâmetros e URL.
export type SafeErrorFields = {
  readonly errorName: string;
  readonly code: string;
  readonly errno: string | undefined;
};

const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

function readToken(source: object, field: string): string | undefined {
  const value: unknown = (source as Record<string, unknown>)[field];
  const text = typeof value === 'number' ? String(value) : value;
  return typeof text === 'string' && SAFE_TOKEN_PATTERN.test(text) ? text : undefined;
}

export function collectErrorChain(error: unknown): readonly object[] {
  const chain: object[] = [];
  let current: unknown = error;
  while (chain.length < MAX_ERROR_CAUSE_DEPTH && typeof current === 'object' && current !== null) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

// Lê do erro MAIS INTERNO que tem `code` (o PostgresError, não o DrizzleQueryError, cujo nome é "Error").
export function readSafeErrorFields(error: unknown): SafeErrorFields {
  const chain = collectErrorChain(error);
  const source = chain.findLast((level) => readToken(level, 'code') !== undefined) ?? chain[0];
  if (source === undefined) {
    return { errorName: UNKNOWN_ERROR_NAME, code: UNKNOWN_ERROR_CODE, errno: undefined };
  }
  return {
    errorName: readToken(source, 'name') ?? UNKNOWN_ERROR_NAME,
    code: readToken(source, 'code') ?? UNKNOWN_ERROR_CODE,
    errno: readToken(source, 'errno'),
  };
}
