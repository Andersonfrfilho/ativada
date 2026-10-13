// Copyright (c) 2026 Ada Technology. All rights reserved.
import { drizzle, type BunSQLDatabase } from 'drizzle-orm/bun-sql';

import {
  CONNECTION_TIMEOUT_SECONDS,
  DEFAULT_QUERY_TIMEOUT_SECONDS,
  MILLISECONDS_PER_SECOND,
  QUERY_TIMEOUT_CONFIRM_SECONDS,
  RECONNECT_BASE_MILLISECONDS,
  RECONNECT_FAILURE_THRESHOLD,
  RECONNECT_MAX_MILLISECONDS,
} from './connection/connection.constant.js';
import { computeStatementTimeoutMilliseconds } from './connection/statement-timeout.js';
import { createResilientDatabase } from './connection/resilient-database.js';
import type { DatabaseHealth, ResilientDatabase } from './connection/resilient-database.types.js';
import type { SqlClient } from './connection/sql-client.types.js';

declare const DATABASE_HANDLE_BRAND: unique symbol;

export type DatabaseHandle = { readonly [DATABASE_HANDLE_BRAND]: 'DatabaseHandle' };

type OpenDatabase = {
  readonly connection: ResilientDatabase;
  readonly database: BunSQLDatabase;
};

const openDatabases = new WeakMap<DatabaseHandle, OpenDatabase>();

export type OpenDatabaseOptions = {
  // A CA (PEM) de um banco que o sistema não conhece (o Railway): com `sslmode=verify-full` na URL, o certificado é validado
  // contra ela E contra o nome do servidor. Sem ela, vale a loja de CAs do sistema.
  readonly sslRootCertificate?: string | undefined;
  // Teto de tempo por unidade de trabalho (consulta avulsa ou transação inteira); vencido, a unidade falha e o cliente é reaberto.
  // O `statement_timeout` do servidor usa este valor menos 5 s (piso de 1 s).
  readonly queryTimeoutSeconds?: number | undefined;
};

function openBunClient(
  databaseUrl: string,
  options: OpenDatabaseOptions,
  queryTimeoutSeconds: number,
): SqlClient {
  const common = {
    connectionTimeout: CONNECTION_TIMEOUT_SECONDS,
    // O servidor aborta a consulta lenta antes do teto do cliente: ela falha com 57014 e não passa por "banco fora".
    connection: {
      statement_timeout: String(computeStatementTimeoutMilliseconds(queryTimeoutSeconds)),
    },
  };
  return options.sslRootCertificate === undefined
    ? new Bun.SQL(databaseUrl, common)
    : new Bun.SQL(databaseUrl, {
        ...common,
        tls: { ca: options.sslRootCertificate, rejectUnauthorized: true },
      });
}

export function openDatabase(
  databaseUrl: string,
  options: OpenDatabaseOptions = {},
): DatabaseHandle {
  const queryTimeoutSeconds = options.queryTimeoutSeconds ?? DEFAULT_QUERY_TIMEOUT_SECONDS;
  const connection = createResilientDatabase({
    openClient: () => openBunClient(databaseUrl, options, queryTimeoutSeconds),
    queryTimeoutMilliseconds: queryTimeoutSeconds * MILLISECONDS_PER_SECOND,
    confirmTimeoutMilliseconds: QUERY_TIMEOUT_CONFIRM_SECONDS * MILLISECONDS_PER_SECOND,
    now: () => Date.now(),
    random: () => Math.random(),
    failureThreshold: RECONNECT_FAILURE_THRESHOLD,
    reconnectBaseMilliseconds: RECONNECT_BASE_MILLISECONDS,
    reconnectMaxMilliseconds: RECONNECT_MAX_MILLISECONDS,
  });
  const handle = Object.freeze({}) as DatabaseHandle;
  // O Drizzle só chama `unsafe` e `begin` do cliente; o porteiro responde por ambos e troca o `Bun.SQL` por baixo.
  openDatabases.set(handle, { connection, database: drizzle(connection as unknown as Bun.SQL) });
  return handle;
}

export function readOpenDatabase(handle: DatabaseHandle): OpenDatabase {
  const openDatabaseEntry = openDatabases.get(handle);
  if (openDatabaseEntry === undefined) throw new Error('DatabaseHandle fechado ou desconhecido');
  return openDatabaseEntry;
}

export async function closeDatabase(handle: DatabaseHandle): Promise<void> {
  const { connection } = readOpenDatabase(handle);
  openDatabases.delete(handle);
  await connection.close();
}

export async function pingDatabase(handle: DatabaseHandle): Promise<boolean> {
  const { connection } = readOpenDatabase(handle);
  try {
    await connection.unsafe('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export function readDatabaseHealth(handle: DatabaseHandle): DatabaseHealth {
  return readOpenDatabase(handle).connection.readHealth();
}
