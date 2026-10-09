// Copyright (c) 2026 Ada Technology. All rights reserved.
import { eq } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { telegramLinkCodes } from '../schema/telegram-link-codes.schema.js';
import { users } from '../schema/users.schema.js';

export type IssueLinkCodeParams = {
  readonly codeHash: string;
  readonly expiresAt: Date;
};

export type TelegramLinkRepository = {
  readonly issueCode: (scope: OwnerScope, params: IssueLinkCodeParams) => Promise<void>;
  readonly unlink: (scope: OwnerScope) => Promise<void>;
};

async function replacePendingCode(
  database: BunSQLDatabase,
  scope: OwnerScope,
  params: IssueLinkCodeParams,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .delete(telegramLinkCodes)
      .where(ownerCondition(scope, telegramLinkCodes.userId));
    await transaction.insert(telegramLinkCodes).values({
      id: Bun.randomUUIDv7(),
      userId: scope.ownerUserId,
      codeHash: params.codeHash,
      expiresAt: params.expiresAt,
    });
  });
}

async function removeLink(database: BunSQLDatabase, scope: OwnerScope): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .delete(telegramLinkCodes)
      .where(ownerCondition(scope, telegramLinkCodes.userId));
    await transaction
      .update(users)
      .set({ telegramChatId: null, updatedAt: new Date() })
      .where(eq(users.id, scope.ownerUserId));
  });
}

export function createTelegramLinkRepository(handle: DatabaseHandle): TelegramLinkRepository {
  const { database } = readOpenDatabase(handle);
  return {
    issueCode: (scope, params) => replacePendingCode(database, scope, params),
    unlink: (scope) => removeLink(database, scope),
  };
}
