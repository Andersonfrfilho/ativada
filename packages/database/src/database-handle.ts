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

export function openDatabase(databaseUrl: string): DatabaseHandle {
  const client = new Bun.SQL(databaseUrl);
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
