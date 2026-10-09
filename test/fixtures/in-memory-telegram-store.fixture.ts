// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  LinkOutcome,
  TelegramLinkConsumer,
  TelegramLinkRepository,
} from '../../packages/database/src/index.js';
import {
  LINK_OUTCOME,
  MAX_ATTEMPTS_PER_LINK_CODE,
} from '../../packages/database/src/telegram/telegram-link.constant.js';
import type { UserId } from '../../packages/database/src/ownership/user-id.js';
import type { StoredUser } from './in-memory-user-store.fixture.js';

export type StoredLinkCode = {
  readonly userId: UserId;
  readonly codeHash: string;
  readonly expiresAt: Date;
  attempts: number;
};

export type InMemoryTelegramStore = {
  readonly linkCodes: Map<UserId, StoredLinkCode>;
  readonly links: TelegramLinkRepository;
  readonly consumer: TelegramLinkConsumer;
};

export function createInMemoryTelegramStore(users: Map<UserId, StoredUser>): InMemoryTelegramStore {
  const linkCodes = new Map<UserId, StoredLinkCode>();

  function findByHash(codeHash: string): StoredLinkCode | undefined {
    return [...linkCodes.values()].find((stored) => stored.codeHash === codeHash);
  }

  function isChatLinkedToAnotherUser(chatId: string, userId: UserId): boolean {
    return [...users.values()].some((user) => user.telegramChatId === chatId && user.id !== userId);
  }

  function registerFailure(code: StoredLinkCode): LinkOutcome {
    code.attempts += 1;
    if (code.attempts >= MAX_ATTEMPTS_PER_LINK_CODE) linkCodes.delete(code.userId);
    return LINK_OUTCOME.REJECTED;
  }

  return {
    linkCodes,
    links: {
      issueCode: (scope, params): Promise<void> => {
        linkCodes.set(scope.ownerUserId, {
          userId: scope.ownerUserId,
          codeHash: params.codeHash,
          expiresAt: params.expiresAt,
          attempts: 0,
        });
        return Promise.resolve();
      },
      unlink: (scope): Promise<void> => {
        linkCodes.delete(scope.ownerUserId);
        const user = users.get(scope.ownerUserId);
        if (user !== undefined) user.telegramChatId = undefined;
        return Promise.resolve();
      },
    },
    consumer: {
      consumeCode: (params): Promise<LinkOutcome> => {
        const code = findByHash(params.codeHash);
        if (code === undefined) return Promise.resolve(LINK_OUTCOME.REJECTED);
        if (code.expiresAt <= params.now) {
          linkCodes.delete(code.userId);
          return Promise.resolve(LINK_OUTCOME.REJECTED);
        }
        const user = users.get(code.userId);
        if (user === undefined || isChatLinkedToAnotherUser(params.chatId, code.userId)) {
          return Promise.resolve(registerFailure(code));
        }
        user.telegramChatId = params.chatId;
        linkCodes.delete(code.userId);
        return Promise.resolve(LINK_OUTCOME.LINKED);
      },
    },
  };
}
