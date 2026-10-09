// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRecencyMap } from '../shared/collections/recency-map.js';
import {
  CHAT_BLOCK_MILLISECONDS,
  CHAT_FAILURE_LIMIT,
  CHAT_FAILURE_WINDOW_MILLISECONDS,
  MAX_TRACKED_CHATS,
} from './telegram.constant.js';

export type ChatAttemptLimiter = {
  readonly isBlocked: (chatId: string) => boolean;
  readonly recordFailure: (chatId: string) => void;
  readonly recordSuccess: (chatId: string) => void;
  readonly trackedChatCount: () => number;
};

type ChatRecord = {
  windowStartedAtMilliseconds: number;
  failures: number;
  blockedUntilMilliseconds: number;
};

export function createChatAttemptLimiter(options: {
  readonly now: () => number;
  readonly maximumEntries?: number;
}): ChatAttemptLimiter {
  const records = createRecencyMap<ChatRecord>({
    maximumEntries: options.maximumEntries ?? MAX_TRACKED_CHATS,
    isIdle: (record) =>
      options.now() - record.windowStartedAtMilliseconds >= CHAT_FAILURE_WINDOW_MILLISECONDS &&
      record.blockedUntilMilliseconds <= options.now(),
  });

  function startRecord(chatId: string, nowMilliseconds: number): ChatRecord {
    const record = {
      windowStartedAtMilliseconds: nowMilliseconds,
      failures: 0,
      blockedUntilMilliseconds: 0,
    };
    records.set(chatId, record);
    return record;
  }

  return {
    isBlocked: (chatId): boolean =>
      (records.get(chatId)?.blockedUntilMilliseconds ?? 0) > options.now(),
    recordFailure: (chatId): void => {
      const nowMilliseconds = options.now();
      const existing = records.get(chatId);
      const isWindowOpen =
        existing !== undefined &&
        nowMilliseconds - existing.windowStartedAtMilliseconds < CHAT_FAILURE_WINDOW_MILLISECONDS;
      const record = isWindowOpen ? existing : startRecord(chatId, nowMilliseconds);
      record.failures += 1;
      if (record.failures >= CHAT_FAILURE_LIMIT) {
        record.blockedUntilMilliseconds = nowMilliseconds + CHAT_BLOCK_MILLISECONDS;
      }
    },
    recordSuccess: (chatId): void => {
      records.delete(chatId);
    },
    trackedChatCount: (): number => records.size(),
  };
}
