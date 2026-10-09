// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseEnvironment, z } from '@crypto/environment';

const DATABASE_URL_SCHEMA = z.object({
  DATABASE_URL: z.string({ error: 'texto não vazio' }).min(1, { error: 'texto não vazio' }),
});

export function readDatabaseUrl(): string {
  return parseEnvironment(DATABASE_URL_SCHEMA, process.env).DATABASE_URL;
}
