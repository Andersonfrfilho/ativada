// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, postgresUrlSchema, z } from '@crypto/environment';

const DATABASE_URL_SCHEMA = z.object({
  DATABASE_URL: postgresUrlSchema,
});

export function readDatabaseUrl(): string {
  return parseEnvironment(DATABASE_URL_SCHEMA, process.env).DATABASE_URL;
}
