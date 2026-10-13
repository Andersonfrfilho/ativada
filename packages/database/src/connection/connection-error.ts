// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DATABASE_UNAVAILABLE_CODE, type DatabaseUnavailableCode } from './connection.constant.js';
import { collectErrorChain } from './safe-error-fields.js';

// ADR 0002, R1: os códigos medidos na reprodução, o nosso teto de tempo e, por defesa, os de rede que o Bun não expôs.
const CONNECTION_FAILURE_CODES: ReadonlySet<string> = new Set([
  'ERR_POSTGRES_CONNECTION_CLOSED',
  'ERR_POSTGRES_CONNECTION_REFUSED',
  'ERR_POSTGRES_CONNECTION_TIMEOUT',
  'ERR_POSTGRES_EXPECTED_REQUEST',
  DATABASE_UNAVAILABLE_CODE.UNAVAILABLE,
  DATABASE_UNAVAILABLE_CODE.QUERY_TIMEOUT,
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
]);
// Classe 08 (conexão) e 57P01/02/03 (parada do operador, falha grave, banco subindo).
const CONNECTION_SQLSTATE_PATTERN = /^(08[0-9A-Z]{3}|57P0[123])$/;

const ERROR_MESSAGE: Readonly<Record<DatabaseUnavailableCode, string>> = {
  [DATABASE_UNAVAILABLE_CODE.UNAVAILABLE]: 'Database unavailable',
  [DATABASE_UNAVAILABLE_CODE.QUERY_TIMEOUT]: 'Database query timed out',
};

// O banco não está ao alcance agora, ou a unidade de trabalho estourou o teto. A mensagem é fixa de propósito.
export class DatabaseUnavailableError extends Error {
  override readonly name = 'DatabaseUnavailableError';
  readonly code: DatabaseUnavailableCode;

  constructor(code: DatabaseUnavailableCode) {
    super(ERROR_MESSAGE[code]);
    this.code = code;
  }
}

function readField(source: object, field: string): string | undefined {
  const value: unknown = (source as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

function isConnectionLevel(level: object): boolean {
  for (const field of ['code', 'errno']) {
    const value = readField(level, field);
    if (value === undefined) continue;
    if (CONNECTION_FAILURE_CODES.has(value) || CONNECTION_SQLSTATE_PATTERN.test(value)) return true;
  }
  return false;
}

// Erro de conexão = o banco ou a rota até ele falhou; erro da consulta (23505, 53300, SQL ruim) segue o caminho de hoje.
export function isDatabaseConnectionFailure(error: unknown): boolean {
  return collectErrorChain(error).some(isConnectionLevel);
}

// Falha rápida do próprio porteiro (nada tocou a rede): não conta como uma falha nova de conexão.
export function isFailFastRejection(error: unknown): boolean {
  return collectErrorChain(error).some(
    (level) => readField(level, 'code') === DATABASE_UNAVAILABLE_CODE.UNAVAILABLE,
  );
}

export function isQueryTimeout(error: unknown): boolean {
  return collectErrorChain(error).some(
    (level) => readField(level, 'code') === DATABASE_UNAVAILABLE_CODE.QUERY_TIMEOUT,
  );
}
