// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PgTable } from 'drizzle-orm/pg-core';

import { telegramLinkCodes } from '../schema/telegram-link-codes.schema.js';
import { users } from '../schema/users.schema.js';

export type PseudonymizedTable = {
  readonly table: PgTable;
  readonly nullifiedColumns: readonly string[];
};

export const OWNED_TABLES: readonly PgTable[] = [telegramLinkCodes];

export const PSEUDONYMIZED_TABLES: readonly PseudonymizedTable[] = [];

export const SHARED_TABLES: readonly PgTable[] = [users];
