// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createChatAttemptLimiter } from '../../apps/api-ativada/src/telegram/chat-attempt-limiter.js';
import { createHandleStartCommandUseCase } from '../../apps/api-ativada/src/telegram/handle-start-command.use-case.js';
import {
  createTelegramRoutes,
  type TelegramRouteDependencies,
} from '../../apps/api-ativada/src/telegram/telegram.routes.js';
import { createTelegramBotClient } from '../../apps/api-ativada/src/telegram/telegram-bot-client.js';
import {
  createIssueLinkCodeUseCase,
  createUnlinkTelegramUseCase,
} from '../../apps/api-ativada/src/telegram/telegram-link.use-case.js';
import { createApiHarness, type ApiHarness } from './api-harness.fixture.js';
import {
  createInMemoryTelegramStore,
  type InMemoryTelegramStore,
} from './in-memory-telegram-store.fixture.js';
import { createInMemoryUserStore, type InMemoryUserStore } from './in-memory-user-store.fixture.js';
import {
  FAKE_BOT_TOKEN,
  FAKE_WEBHOOK_SECRET,
  startFakeTelegram,
  type FakeTelegram,
} from './fake-telegram.fixture.js';
import { SUBJECT_A, SUBJECT_B, USER_A_ID, USER_B_ID } from './profile-harness.fixture.js';
import { signTestToken } from './token-signing.fixture.js';

export type TelegramHarnessOptions = {
  readonly isWebhookConfigured?: boolean;
  readonly isLinkCodeIssuingConfigured?: boolean;
};

export type TelegramHarness = {
  readonly api: ApiHarness;
  readonly users: InMemoryUserStore;
  readonly telegram: InMemoryTelegramStore;
  readonly fakeTelegram: FakeTelegram;
  readonly clock: { advance: (milliseconds: number) => void; now: () => number };
  readonly tokenFor: (subject: string) => Promise<string>;
  readonly stop: () => Promise<void>;
};

function buildDependencies(
  harness: Pick<TelegramHarness, 'telegram' | 'fakeTelegram' | 'clock'>,
  options: TelegramHarnessOptions,
): TelegramRouteDependencies {
  const now = harness.clock.now;
  const handleStartCommand = createHandleStartCommandUseCase({
    consumer: harness.telegram.consumer,
    limiter: createChatAttemptLimiter({ now }),
    botClient: createTelegramBotClient({
      apiBaseUrl: harness.fakeTelegram.baseUrl,
      botToken: FAKE_BOT_TOKEN,
    }),
    now,
    reportReplyFailure: () => undefined,
  });
  return {
    unlinkTelegram: createUnlinkTelegramUseCase(harness.telegram.links),
    issueLinkCode:
      options.isLinkCodeIssuingConfigured === false
        ? undefined
        : createIssueLinkCodeUseCase({ repository: harness.telegram.links, now }),
    webhook:
      options.isWebhookConfigured === false
        ? undefined
        : { secret: FAKE_WEBHOOK_SECRET, handleStartCommand },
  };
}

export async function createTelegramHarness(
  options: TelegramHarnessOptions = {},
): Promise<TelegramHarness> {
  const users = createInMemoryUserStore();
  users.seedUser({ id: USER_A_ID, subject: SUBJECT_A });
  users.seedUser({ id: USER_B_ID, subject: SUBJECT_B });
  const telegram = createInMemoryTelegramStore(users.users);
  const fakeTelegram = startFakeTelegram();
  let nowMilliseconds = Date.now();
  const clock = {
    advance: (milliseconds: number): void => {
      nowMilliseconds += milliseconds;
    },
    now: (): number => nowMilliseconds,
  };
  const dependencies = buildDependencies({ telegram, fakeTelegram, clock }, options);
  const api = await createApiHarness({
    userIdsBySubject: { [SUBJECT_A]: USER_A_ID, [SUBJECT_B]: USER_B_ID },
    routeFactory: () => createTelegramRoutes(dependencies),
  });
  return {
    api,
    users,
    telegram,
    fakeTelegram,
    clock,
    tokenFor: (subject) => signTestToken({ key: api.key, claims: { sub: subject } }),
    stop: async (): Promise<void> => {
      await api.stop();
      await fakeTelegram.stop();
    },
  };
}
