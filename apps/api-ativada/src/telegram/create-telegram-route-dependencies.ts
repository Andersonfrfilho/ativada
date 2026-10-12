// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createTelegramLinkConsumer,
  createTelegramLinkRepository,
  type DatabaseHandle,
} from '@ativada/database';

import type { Environment } from '../environment.js';
import type { Logger } from '../logging/logger.js';
import { createChatAttemptLimiter } from './chat-attempt-limiter.js';
import { createHandleStartCommandUseCase } from './handle-start-command.use-case.js';
import type { TelegramRouteDependencies } from './telegram.routes.js';
import { createTelegramBotClient } from './telegram-bot-client.js';
import {
  createIssueLinkCodeUseCase,
  createUnlinkTelegramUseCase,
} from './telegram-link.use-case.js';

export type TelegramEnvironment = Pick<
  Environment,
  'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_WEBHOOK_SECRET' | 'TELEGRAM_API_BASE_URL'
>;

export type CreateTelegramRouteDependenciesParams = {
  readonly environment: TelegramEnvironment;
  readonly database: DatabaseHandle;
  readonly logger: Logger;
  readonly now: () => number;
};

export function createTelegramRouteDependencies(
  params: CreateTelegramRouteDependenciesParams,
): TelegramRouteDependencies {
  const { environment, database, logger, now } = params;
  const repository = createTelegramLinkRepository(database);
  const unlinkTelegram = createUnlinkTelegramUseCase(repository);
  const { TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_WEBHOOK_SECRET: secret } = environment;
  if (botToken === undefined || secret === undefined) {
    return { unlinkTelegram, issueLinkCode: undefined, webhook: undefined };
  }
  return {
    unlinkTelegram,
    issueLinkCode: createIssueLinkCodeUseCase({ repository, now }),
    webhook: {
      secret,
      handleStartCommand: createHandleStartCommandUseCase({
        consumer: createTelegramLinkConsumer(database),
        limiter: createChatAttemptLimiter({ now }),
        botClient: createTelegramBotClient({
          apiBaseUrl: environment.TELEGRAM_API_BASE_URL,
          botToken,
        }),
        now,
        reportReplyFailure: () => logger.warn('telegram reply failed'),
      }),
    },
  };
}
