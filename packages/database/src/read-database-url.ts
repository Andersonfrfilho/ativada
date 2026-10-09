// Copyright (c) 2026 Ada Technology. All rights reserved.
export function readDatabaseUrl(): string {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL ausente: defina-a no ambiente antes de rodar o comando de banco');
  }
  return databaseUrl;
}
