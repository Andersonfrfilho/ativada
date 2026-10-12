// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createWorkerLogger } from '../../../apps/worker-ativada/src/logging/worker-logger.js';
import { loadAlertsApi } from './alerts-api.fixture.js';
import { alertPayload } from './alert-payload.fixture.js';
import {
  BOT_TOKEN,
  startFakeTelegramBot,
  type FakeTelegramBot,
} from './fake-telegram-bot.fixture.js';
import {
  createInMemoryAlerts,
  type EnqueueParams,
  type InMemoryAlerts,
} from './in-memory-alert-repository.fixture.js';

export const START_TIME = Date.parse('2026-10-10T12:00:00.000Z');
export const SECOND = 1_000;
export const CHAT_OF_A = '730000001';
export const CHAT_OF_B = '730000002';
export const USER_A = 'user-a';
export const USER_B = 'user-b';
export const USER_C = 'user-c';
export const RUN_OF_A = 'run-a';
export const RUN_OF_B = 'run-b';
export const RUN_OF_C = 'run-c';

const { createAlertDispatcher, createTelegramClient } = await loadAlertsApi();

export type DispatcherHarness = {
  readonly bot: FakeTelegramBot;
  readonly alerts: InMemoryAlerts;
  readonly dispatcher: ReturnType<typeof createAlertDispatcher>;
  readonly logLines: string[];
  readonly clock: { now: number };
  readonly enqueue: (overrides?: Partial<EnqueueParams>) => boolean;
  readonly stop: () => Promise<void>;
};

export type DispatcherHarnessOptions = {
  readonly bot?: FakeTelegramBot;
  readonly linked?: boolean;
  // Teto de mensagens enviadas por usuário nas últimas 24 h (padrão alto: só os testes do teto o baixam).
  readonly dailyLimitPerUser?: number;
};

const DEFAULT_DAILY_LIMIT_PER_USER = 1_000;

let candleCounter = 0;

// Despachante de produção + cliente de produção + Bot API falsa em HTTP de verdade + caixa de saída em memória.
export function createDispatcherHarness(options: DispatcherHarnessOptions = {}): DispatcherHarness {
  const bot = options.bot ?? startFakeTelegramBot();
  const clock = { now: START_TIME };
  const alerts = createInMemoryAlerts(() => clock.now);
  if (options.linked !== false) alerts.linkChat(USER_A, CHAT_OF_A);
  const logLines: string[] = [];
  const dispatcher = createAlertDispatcher({
    alerts: alerts.repository,
    client: createTelegramClient({ apiBaseUrl: bot.baseUrl, botToken: BOT_TOKEN }),
    logger: createWorkerLogger({
      appName: 'worker-test',
      write: (line) => void logLines.push(line),
    }),
    now: () => clock.now,
    dailyLimitPerUser: options.dailyLimitPerUser ?? DEFAULT_DAILY_LIMIT_PER_USER,
  });
  return {
    bot,
    alerts,
    dispatcher,
    logLines,
    clock,
    enqueue: (overrides = {}): boolean => {
      candleCounter += 1;
      return alerts.enqueue({
        userId: USER_A,
        runId: RUN_OF_A,
        candleTime: START_TIME + candleCounter * 3_600_000,
        side: 'BUY',
        payload: alertPayload(),
        ...overrides,
      });
    },
    stop: () => bot.stop(),
  };
}
