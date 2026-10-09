// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { telegramLinkCodes } from '../schema/telegram-link-codes.schema.js';
import { users } from '../schema/users.schema.js';
import {
  LINK_OUTCOME,
  MAX_ATTEMPTS_PER_LINK_CODE,
  type LinkOutcome,
} from './telegram-link.constant.js';

export type ConsumeLinkCodeParams = {
  readonly codeHash: string;
  readonly chatId: string;
  readonly now: Date;
};

export type TelegramLinkConsumer = {
  readonly consumeCode: (params: ConsumeLinkCodeParams) => Promise<LinkOutcome>;
};

type Transaction = Parameters<Parameters<BunSQLDatabase['transaction']>[0]>[0];

type PendingCode = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly attempts: number;
};

async function lockPendingCode(
  transaction: Transaction,
  codeHash: string,
): Promise<PendingCode | undefined> {
  const rows = await transaction
    .select({
      id: telegramLinkCodes.id,
      userId: telegramLinkCodes.userId,
      expiresAt: telegramLinkCodes.expiresAt,
      attempts: telegramLinkCodes.attempts,
    })
    .from(telegramLinkCodes)
    .where(eq(telegramLinkCodes.codeHash, codeHash))
    .limit(1)
    .for('update');
  return rows[0];
}

async function discardCode(transaction: Transaction, codeId: string): Promise<void> {
  await transaction.delete(telegramLinkCodes).where(eq(telegramLinkCodes.id, codeId));
}

async function registerFailedAttempt(transaction: Transaction, code: PendingCode): Promise<void> {
  const attempts = code.attempts + 1;
  if (attempts >= MAX_ATTEMPTS_PER_LINK_CODE) return discardCode(transaction, code.id);
  await transaction
    .update(telegramLinkCodes)
    .set({ attempts })
    .where(eq(telegramLinkCodes.id, code.id));
}

async function isChatLinkedToAnotherUser(
  transaction: Transaction,
  params: { readonly chatId: string; readonly userId: string },
): Promise<boolean> {
  const rows = await transaction
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.telegramChatId, params.chatId), ne(users.id, params.userId)))
    .limit(1);
  return rows.length > 0;
}

async function linkChatToUser(
  transaction: Transaction,
  params: { readonly chatId: string; readonly userId: string },
): Promise<boolean> {
  const rows = await transaction
    .update(users)
    .set({ telegramChatId: params.chatId, updatedAt: new Date() })
    .where(and(eq(users.id, params.userId), isNull(users.deletedAt), isNull(users.blockedAt)))
    .returning({ id: users.id });
  return rows.length > 0;
}

async function redeemCode(
  transaction: Transaction,
  params: ConsumeLinkCodeParams,
): Promise<LinkOutcome> {
  const code = await lockPendingCode(transaction, params.codeHash);
  if (code === undefined) return LINK_OUTCOME.REJECTED;
  if (code.expiresAt <= params.now) {
    await discardCode(transaction, code.id);
    return LINK_OUTCOME.REJECTED;
  }
  const target = { chatId: params.chatId, userId: code.userId };
  const isConflict = await isChatLinkedToAnotherUser(transaction, target);
  const isLinked = !isConflict && (await linkChatToUser(transaction, target));
  if (!isLinked) {
    await registerFailedAttempt(transaction, code);
    return LINK_OUTCOME.REJECTED;
  }
  await discardCode(transaction, code.id);
  return LINK_OUTCOME.LINKED;
}

export function createTelegramLinkConsumer(handle: DatabaseHandle): TelegramLinkConsumer {
  const { database } = readOpenDatabase(handle);
  return {
    consumeCode: (params) => database.transaction((transaction) => redeemCode(transaction, params)),
  };
}
