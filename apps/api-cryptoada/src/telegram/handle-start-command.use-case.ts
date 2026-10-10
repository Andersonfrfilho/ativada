// Copyright (c) 2026 Ada Technology. All rights reserved.
import { LINK_OUTCOME, type TelegramLinkConsumer } from '@cryptoada/database';

import { hashLinkCode } from './link-code.js';
import type { ChatAttemptLimiter } from './chat-attempt-limiter.js';
import { BOT_MESSAGE } from './telegram.constant.js';
import type { TelegramBotClient } from './telegram-bot-client.js';
import type { StartCommand } from './telegram-update.schema.js';

export type HandleStartCommandUseCase = (command: StartCommand) => Promise<void>;

export type HandleStartCommandDependencies = {
  readonly consumer: TelegramLinkConsumer;
  readonly limiter: ChatAttemptLimiter;
  readonly botClient: TelegramBotClient;
  readonly now: () => number;
  readonly reportReplyFailure: () => void;
};

export function createHandleStartCommandUseCase(
  dependencies: HandleStartCommandDependencies,
): HandleStartCommandUseCase {
  const { consumer, limiter, botClient, now, reportReplyFailure } = dependencies;
  return async (command) => {
    if (limiter.isBlocked(command.chatId)) return;
    const outcome = await consumer.consumeCode({
      codeHash: hashLinkCode(command.code),
      chatId: command.chatId,
      now: new Date(now()),
    });
    const isLinked = outcome === LINK_OUTCOME.LINKED;
    if (isLinked) limiter.recordSuccess(command.chatId);
    else limiter.recordFailure(command.chatId);
    const text = isLinked ? BOT_MESSAGE.LINKED : BOT_MESSAGE.REJECTED;
    const wasSent = await botClient.sendMessage({ chatId: command.chatId, text });
    if (!wasSent) reportReplyFailure();
  };
}
