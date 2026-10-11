// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createMarketPublisher } from '../../apps/api-cryptoada/src/market-stream/create-market-publisher.js';
import type { MarketPublisher } from '../../apps/api-cryptoada/src/market-stream/market-context.js';
import { createPriceAlertEvaluator } from '../../apps/api-cryptoada/src/price-alerts/price-alert-evaluator.js';
import { generateLinkCode, hashLinkCode } from '../../apps/api-cryptoada/src/telegram/link-code.js';
import { createAlertDispatcher } from '../../apps/worker-cryptoada/src/alerts/alert-dispatcher.js';
import { createTelegramClient } from '../../apps/worker-cryptoada/src/alerts/telegram-client.js';
import { createWorkerLogger } from '../../apps/worker-cryptoada/src/logging/worker-logger.js';
import {
  closeDatabase,
  createAlertRepository,
  createPriceAlertEvaluationRepository,
  createPriceAlertRepository,
  createRunEventListener,
  createTelegramLinkConsumer,
  createTelegramLinkRepository,
  LINK_OUTCOME,
  openDatabase,
  resolveUserBySubject,
  USER_RESOLUTION_STATUS,
  type DatabaseHandle,
  type NotificationListener,
  type OwnerScope,
  type PriceAlertEvent,
  type PriceAlertDirection,
} from '../../packages/database/src/index.js';
import { createManualTimers } from '../../test/fixtures/ticker/manual-timers.fixture.js';
import {
  BOT_TOKEN,
  startFakeTelegramBot,
  type FakeTelegramBot,
} from '../../test/fixtures/telegram/fake-telegram-bot.fixture.js';
import {
  CLOCK_HEAD_START_MILLISECONDS,
  DAILY_LIMIT_PER_USER,
  MAX_ENABLED,
  NO_REFIRE_INTERVAL_MILLISECONDS,
  OTHER_SYMBOL,
  SECOND,
  STALE_MILLISECONDS,
  SUBJECT_PREFIX,
  SYMBOL,
} from './price-alerts-test.constant.js';

export type PriceUser = {
  readonly subject: string;
  readonly scope: OwnerScope;
  readonly id: string;
};

// Uma instância da API: o publicador do ticker (código de produção), o avaliador e o próprio acesso ao banco.
export type ApiInstance = {
  readonly handle: DatabaseHandle;
  readonly publisher: MarketPublisher;
  readonly advance: (milliseconds: number) => void;
};

export type PriceAlertsTestContext = {
  readonly databaseUrl: string;
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly bot: FakeTelegramBot;
  readonly clock: { now: number };
  readonly logLines: string[];
  readonly dispatcher: ReturnType<typeof createAlertDispatcher>;
  readonly instances: readonly [ApiInstance, ApiInstance];
  readonly events: PriceAlertEvent[];
  readonly notificationState: { malformed: number };
  readonly listener: NotificationListener;
  // As avaliações em andamento de todas as instâncias: `settle` espera o banco terminar.
  readonly pending: Promise<unknown>[];
};

export function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function reportLine(message: string): void {
  process.stdout.write(`price-alerts-test: ${message}\n`);
}

function createInstance(
  databaseUrl: string,
  clock: { now: number },
  pending: Promise<unknown>[],
): ApiInstance {
  const handle = openDatabase(databaseUrl);
  const timers = createManualTimers();
  const publisher = createMarketPublisher<number>({
    pairs: [SYMBOL, OTHER_SYMBOL],
    maxPairsPerSocket: 10,
    staleAfterMilliseconds: STALE_MILLISECONDS,
    now: () => clock.now,
    serverTime: () => clock.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    reportError: (error) => {
      throw error instanceof Error ? error : new Error('erro do publicador');
    },
  });
  const evaluator = createPriceAlertEvaluator({
    repository: createPriceAlertEvaluationRepository(handle),
    now: () => clock.now,
    staleAfterMilliseconds: STALE_MILLISECONDS,
    minimumRefireMilliseconds: NO_REFIRE_INTERVAL_MILLISECONDS,
  });
  publisher.addListener({
    onTick: (tick) => {
      const running = Promise.resolve(evaluator.onTick(tick));
      pending.push(running);
      return running;
    },
  });
  return { handle, publisher, advance: timers.advance };
}

export async function createPriceAlertsTestContext(
  databaseUrl: string,
): Promise<PriceAlertsTestContext> {
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  const bot = startFakeTelegramBot();
  const clock = { now: Date.now() };
  const pending: Promise<unknown>[] = [];
  const logLines: string[] = [];
  const dispatcherClock = Date.now() + CLOCK_HEAD_START_MILLISECONDS;
  const dispatcher = createAlertDispatcher({
    alerts: createAlertRepository(handle),
    client: createTelegramClient({ apiBaseUrl: bot.baseUrl, botToken: BOT_TOKEN }),
    logger: createWorkerLogger({
      appName: 'worker-price-alerts-test',
      write: (line) => void logLines.push(line),
    }),
    now: () => dispatcherClock,
    dailyLimitPerUser: DAILY_LIMIT_PER_USER,
  });
  const events: PriceAlertEvent[] = [];
  const notificationState = { malformed: 0 };
  const listener = createRunEventListener({
    databaseUrl,
    onEvent: () => undefined,
    onPriceAlert: (event) => void events.push(event),
    onMalformed: () => {
      notificationState.malformed += 1;
    },
    onListening: () => undefined,
    onLost: () => undefined,
    onHandlerError: () => undefined,
  });
  await listener.ready;
  return {
    databaseUrl,
    handle,
    client,
    bot,
    clock,
    logLines,
    dispatcher,
    instances: [
      createInstance(databaseUrl, clock, pending),
      createInstance(databaseUrl, clock, pending),
    ],
    events,
    notificationState,
    listener,
    pending,
  };
}

export async function closePriceAlertsTestContext(context: PriceAlertsTestContext): Promise<void> {
  await context.listener.close();
  await context.bot.stop();
  for (const instance of context.instances) await closeDatabase(instance.handle);
  await context.client.close();
  await closeDatabase(context.handle);
}

export async function createPriceUser(
  context: PriceAlertsTestContext,
  name: string,
  chatId?: string,
): Promise<PriceUser> {
  const subject = `${SUBJECT_PREFIX}-${name}`;
  const resolution = await resolveUserBySubject(context.handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  if (chatId !== undefined) await linkChat(context, { scope: resolution.scope, chatId });
  return { subject, scope: resolution.scope, id: resolution.userId };
}

// Pelo MESMO caminho do webhook do bot: emite o código (só o hash vai ao banco) e o consome com o chat.
async function linkChat(
  context: PriceAlertsTestContext,
  params: { readonly scope: OwnerScope; readonly chatId: string },
): Promise<void> {
  const code = generateLinkCode();
  await createTelegramLinkRepository(context.handle).issueCode(params.scope, {
    codeHash: hashLinkCode(code),
    expiresAt: new Date(Date.now() + 600_000),
  });
  const outcome = await createTelegramLinkConsumer(context.handle).consumeCode({
    codeHash: hashLinkCode(code),
    chatId: params.chatId,
    now: new Date(),
  });
  assertCondition(outcome === LINK_OUTCOME.LINKED, `vínculo do chat ${params.chatId} recusado`);
}

export async function createAlert(
  context: PriceAlertsTestContext,
  params: {
    readonly user: PriceUser;
    readonly direction: PriceAlertDirection;
    readonly value: string;
    readonly symbol?: string;
  },
): Promise<string> {
  const created = await createPriceAlertRepository(context.handle).createPriceAlert(
    params.user.scope,
    {
      symbol: params.symbol ?? SYMBOL,
      direction: params.direction,
      value: params.value,
      origin: 'manual',
      maxEnabled: MAX_ENABLED,
    },
  );
  if (created.outcome !== 'created') throw new Error('alerta não criado');
  return created.alert.id;
}

export type AlertState = {
  readonly is_enabled: boolean;
  readonly triggered_at: Date | null;
};

export async function readAlertState(
  context: PriceAlertsTestContext,
  alertId: string,
): Promise<AlertState> {
  const rows: unknown =
    await context.client`SELECT is_enabled, triggered_at FROM price_alerts WHERE id = ${alertId}`;
  const row = (rows as readonly AlertState[])[0];
  if (row === undefined) throw new Error('alerta sumiu');
  return row;
}

export async function countOutbox(
  context: PriceAlertsTestContext,
  alertId: string,
): Promise<number> {
  const rows: unknown =
    await context.client`SELECT count(*)::int AS total FROM alerts WHERE price_alert_id = ${alertId}`;
  return (rows as readonly { total: number }[])[0]?.total ?? 0;
}

// Empurra um tick bruto na instância, deixa o agregador publicá-lo (1 s) e espera o banco terminar as avaliações.
export async function pushTick(
  context: PriceAlertsTestContext,
  params: {
    readonly instance: ApiInstance;
    readonly price: string;
    readonly symbol?: string;
    readonly eventTime?: number;
  },
): Promise<void> {
  context.clock.now += SECOND;
  params.instance.publisher.handleRawTick({
    symbol: params.symbol ?? SYMBOL,
    price: params.price,
    openPrice: params.price,
    eventTime: params.eventTime ?? context.clock.now,
  });
  params.instance.advance(SECOND);
  await settle(context);
}

export async function settle(context: PriceAlertsTestContext): Promise<void> {
  await Promise.all(context.pending.splice(0));
}

export async function waitForEvents(context: PriceAlertsTestContext, count: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (context.events.length < count && Date.now() < deadline) {
    await Bun.sleep(20);
  }
  assertCondition(
    context.events.length === count,
    `${context.events.length} avisos de disparo; esperava ${count}`,
  );
}

export function messagesTo(context: PriceAlertsTestContext, chatId: string): readonly string[] {
  return context.bot.requests
    .filter((request) => String(request.body.chat_id) === chatId)
    .map((request) => String(request.body.text));
}

export async function dispatchUntilQuiet(context: PriceAlertsTestContext): Promise<number> {
  let sent = 0;
  for (let round = 0; round < 50; round += 1) {
    const summary = await context.dispatcher.tick();
    sent += summary.sent;
    if (summary.claimed === 0) return sent;
  }
  throw new Error('o despachante não ficou ocioso');
}
