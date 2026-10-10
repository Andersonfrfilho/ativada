// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

// O que o repositório precisa do Drizzle; a transação satisfaz o mesmo formato que o cliente.
export type DatabaseExecutor = Pick<
  BunSQLDatabase,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>;
