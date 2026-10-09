// Copyright (c) 2026 Ada Technology. All rights reserved.
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { MIGRATIONS_FOLDER } from './database.constant.js';
import { readDatabaseUrl } from './read-database-url.js';

export async function applyMigrations(options: {
  readonly databaseUrl: string;
  readonly migrationsFolder: string;
}): Promise<void> {
  const client = new Bun.SQL(options.databaseUrl);
  try {
    await migrate(drizzle(client), { migrationsFolder: options.migrationsFolder });
  } finally {
    await client.close();
  }
}

if (import.meta.main) {
  await applyMigrations({ databaseUrl: readDatabaseUrl(), migrationsFolder: MIGRATIONS_FOLDER });
}
