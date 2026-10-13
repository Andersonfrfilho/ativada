// Copyright (c) 2026 Ada Technology. All rights reserved.
import { DATABASE_UNAVAILABLE_CODE, type DatabaseUnavailableCode } from './connection.constant.js';
import { collectErrorChain } from './safe-error-fields.js';

// ADR 0002, R1: os códigos medidos na reprodução e o nosso teto de tempo.
const CONNECTION_FAILURE_CODES: ReadonlySet<string> = new Set([
  'ERR_POSTGRES_CONNECTION_CLOSED',
  'ERR_POSTGRES_CONNECTION_REFUSED',
  'ERR_POSTGRES_CONNECTION_TIMEOUT',
  'ERR_POSTGRES_EXPECTED_REQUEST',
  DATABASE_UNAVAILABLE_CODE.UNAVAILABLE,
  DATABASE_UNAVAILABLE_CODE.QUERY_TIMEOUT,
]);
// Por defesa (o Bun 1.4.3 não os expôs): só contam quando o próprio nível do erro é do driver (`name === 'PostgresError'`).
// Erro de outra integração (Keycloak, Telegram, Binance) traz o mesmo código na `cause` e NÃO é banco fora.
const DRIVER_NAME = 'PostgresError';
const DRIVER_NETWORK_CODES: ReadonlySet<string> = new Set([
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

function isConnectionCode(value: string, isDriverLevel: boolean): boolean {
  if (CONNECTION_FAILURE_CODES.has(value) || CONNECTION_SQLSTATE_PATTERN.test(value)) return true;
  return isDriverLevel && DRIVER_NETWORK_CODES.has(value);
}

function isConnectionLevel(level: object): boolean {
  const isDriverLevel = readField(level, 'name') === DRIVER_NAME;
  for (const field of ['code', 'errno']) {
    const value = readField(level, field);
    if (value !== undefined && isConnectionCode(value, isDriverLevel)) return true;
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
