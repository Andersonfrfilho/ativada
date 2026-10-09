// Copyright (c) 2026 Ada Technology. All rights reserved.
import { defineConfig } from 'drizzle-kit';

// drizzle-kit só lê export default; o único process.env direto do pacote fica aqui.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
