// Copyright (c) 2026 Ada Technology. All rights reserved.
// Aplica as migrations com a pasta recebida como primeiro argumento (o dev-up.ps1 a passa certa no Windows,
// onde `new URL().pathname` do pacote devolve `/C:/...`). Sem argumento, usa a pasta do pacote.
import { MIGRATIONS_FOLDER } from '../packages/database/src/database.constant.js';
import { applyMigrations } from '../packages/database/src/migrate.js';
import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';

await applyMigrations({
  databaseUrl: readDatabaseUrl(),
  migrationsFolder: process.argv[2] ?? MIGRATIONS_FOLDER,
});
