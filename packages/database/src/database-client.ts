// Copyright (c) 2026 Ada Technology. All rights reserved.
import { drizzle, type BunSQLDatabase } from 'drizzle-orm/bun-sql';

// Interno ao pacote: as apps recebem repositórios com escopo de dono, nunca o cliente cru (ADR 0001 §e).
export function createDatabaseClient(databaseUrl: string): BunSQLDatabase {
  return drizzle(new Bun.SQL(databaseUrl));
}
