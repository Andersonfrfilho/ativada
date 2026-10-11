// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAlertDispatcher } from '../../apps/worker-cryptoada/src/alerts/alert-dispatcher.js';
import { createTelegramClient } from '../../apps/worker-cryptoada/src/alerts/telegram-client.js';
import { createWorkerLogger } from '../../apps/worker-cryptoada/src/logging/worker-logger.js';
import { generateLinkCode, hashLinkCode } from '../../apps/api-cryptoada/src/telegram/link-code.js';
import {
  createAlertRepository,
  createTelegramLinkConsumer,
  createTelegramLinkRepository,
  LINK_OUTCOME,
} from '../../packages/database/src/index.js';
import {
  BOT_TOKEN,
  startFakeTelegramBot,
  type FakeTelegramBot,
} from '../../test/fixtures/telegram/fake-telegram-bot.fixture.js';
import {
  assertCondition,
  reportLine,
  type LiveTestContext,
  type LiveUser,
} from '../live-test/live-test-context.js';
import { CLOCK_HEAD_START_MILLISECONDS, DAILY_LIMIT_PER_USER } from './telegram-test.constant.js';

export type TelegramTestContext = {
  readonly live: LiveTestContext;
  readonly bot: FakeTelegramBot;
  readonly clock: { now: number };
  // Tudo o que o despachante e o avaliador escreveram em log durante o teste inteiro.
  readonly logLines: string[];
  readonly dispatcher: ReturnType<typeof createAlertDispatcher>;
};

export type AlertRow = {
  readonly id: string;
  readonly user_id: string;
  readonly run_id: string;
  readonly candle_time: string;
  readonly side: string;
  readonly status: string;
  readonly attempts: number;
  readonly last_error: string | null;
  readonly next_attempt_at: Date;
  readonly sent_at: Date | null;
};

export { assertCondition, reportLine };

export function reportTelegramLine(message: string): void {
  process.stdout.write(`telegram-test: ${message}\n`);
}

export function createTelegramTestContext(live: LiveTestContext): TelegramTestContext {
  const bot = startFakeTelegramBot();
  const clock = { now: Date.now() + CLOCK_HEAD_START_MILLISECONDS };
  const logLines: string[] = [];
  const logger = createWorkerLogger({
    appName: 'worker-telegram-test',
    write: (line) => void logLines.push(line),
  });
  const dispatcher = createAlertDispatcher({
    alerts: createAlertRepository(live.handle),
    client: createTelegramClient({ apiBaseUrl: bot.baseUrl, botToken: BOT_TOKEN }),
    logger,
    now: () => clock.now,
    dailyLimitPerUser: DAILY_LIMIT_PER_USER,
  });
  return { live, bot, clock, logLines, dispatcher };
}

export async function closeTelegramTestContext(context: TelegramTestContext): Promise<void> {
  await context.bot.stop();
}

// Passa pelo MESMO caminho do webhook do bot: emite o código (só o hash vai ao banco) e o consome com o chat.
export async function linkChat(user: LiveUser, params: LinkParams): Promise<void> {
  const code = generateLinkCode();
  await createTelegramLinkRepository(params.context.handle).issueCode(user.scope, {
    codeHash: hashLinkCode(code),
    expiresAt: new Date(Date.now() + 600_000),
  });
  const outcome = await createTelegramLinkConsumer(params.context.handle).consumeCode({
    codeHash: hashLinkCode(code),
    chatId: params.chatId,
    now: new Date(),
  });
  assertCondition(outcome === LINK_OUTCOME.LINKED, `vínculo do chat ${params.label} recusado`);
}

export type LinkParams = {
  readonly context: LiveTestContext;
  readonly chatId: string;
  readonly label: string;
};

export async function readAlerts(
  context: TelegramTestContext,
  filter: { readonly runId?: string } = {},
): Promise<readonly AlertRow[]> {
  const { client } = context.live;
  const rows: unknown =
    filter.runId === undefined
      ? await client`SELECT * FROM alerts ORDER BY candle_time, side`
      : await client`SELECT * FROM alerts WHERE run_id = ${filter.runId} ORDER BY candle_time, side`;
  return rows as readonly AlertRow[];
}

export async function countSignalsToAlert(
  context: TelegramTestContext,
  runId: string,
): Promise<number> {
  const rows: unknown = await context.live.client`SELECT count(*)::int AS total FROM signals
    WHERE run_id = ${runId} AND action IN ('BUY', 'SELL')`;
  return (rows as readonly { total: number }[])[0]?.total ?? 0;
}

// Rondas do despachante até uma sem nada a fazer; devolve o que foi enviado no total.
export async function dispatchUntilQuiet(context: TelegramTestContext): Promise<number> {
  let sent = 0;
  for (let round = 0; round < 200; round += 1) {
    const summary = await context.dispatcher.tick();
    sent += summary.sent;
    if (summary.claimed === 0) return sent;
  }
  throw new Error('o despachante não ficou ocioso');
}

export function messagesTo(context: TelegramTestContext, chatId: string): readonly string[] {
  return context.bot.requests
    .filter((request) => String(request.body.chat_id) === chatId)
    .map((request) => String(request.body.text));
}
