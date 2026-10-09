// Copyright (c) 2026 Ada Technology. All rights reserved.
import { drizzle, type BunSQLDatabase } from 'drizzle-orm/bun-sql';

export * from './ownership/index.js';
export * from './schema/index.js';

export function createDatabaseClient(databaseUrl: string): BunSQLDatabase {
  return drizzle(new Bun.SQL(databaseUrl));
}
