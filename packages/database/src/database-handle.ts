// Copyright (c) 2026 Ada Technology. All rights reserved.
import { drizzle, type BunSQLDatabase } from 'drizzle-orm/bun-sql';

// Espera as consultas em andamento só este tanto: banco inalcançável não pode segurar o encerramento.
const CLOSE_DRAIN_SECONDS = 1;

declare const DATABASE_HANDLE_BRAND: unique symbol;

export type DatabaseHandle = { readonly [DATABASE_HANDLE_BRAND]: 'DatabaseHandle' };

type OpenDatabase = {
  readonly client: Bun.SQL;
  readonly database: BunSQLDatabase;
};

const openDatabases = new WeakMap<DatabaseHandle, OpenDatabase>();

export type OpenDatabaseOptions = {
  // A CA (PEM) de um banco que o sistema não conhece (o Railway): com `sslmode=verify-full` na URL, o certificado é validado
  // contra ela E contra o nome do servidor. Sem ela, vale a loja de CAs do sistema.
  readonly sslRootCertificate?: string | undefined;
};

export function openDatabase(
  databaseUrl: string,
  options: OpenDatabaseOptions = {},
): DatabaseHandle {
  const client =
    options.sslRootCertificate === undefined
      ? new Bun.SQL(databaseUrl)
      : new Bun.SQL(databaseUrl, {
          tls: { ca: options.sslRootCertificate, rejectUnauthorized: true },
        });
  const handle = Object.freeze({}) as DatabaseHandle;
  openDatabases.set(handle, { client, database: drizzle(client) });
  return handle;
}

export function readOpenDatabase(handle: DatabaseHandle): OpenDatabase {
  const openDatabaseEntry = openDatabases.get(handle);
  if (openDatabaseEntry === undefined) throw new Error('DatabaseHandle fechado ou desconhecido');
  return openDatabaseEntry;
}

export async function closeDatabase(handle: DatabaseHandle): Promise<void> {
  const { client } = readOpenDatabase(handle);
  openDatabases.delete(handle);
  await client.close({ timeout: CLOSE_DRAIN_SECONDS });
}

export async function pingDatabase(handle: DatabaseHandle): Promise<boolean> {
  const { client } = readOpenDatabase(handle);
  try {
    await client`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
