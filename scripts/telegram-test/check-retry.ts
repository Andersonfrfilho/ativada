// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAlertDispatcher } from '../../apps/worker-cryptoada/src/alerts/alert-dispatcher.js';
import { createTelegramClient } from '../../apps/worker-cryptoada/src/alerts/telegram-client.js';
import { createWorkerLogger } from '../../apps/worker-cryptoada/src/logging/worker-logger.js';
import {
  createAlertRepository,
  createRunBatchRepository,
  type JsonContainer,
} from '../../packages/database/src/index.js';
import { alertPayload } from '../../test/fixtures/telegram/alert-payload.fixture.js';
import {
  BOT_TOKEN,
  rateLimited,
  startFakeTelegramBot,
  telegramError,
} from '../../test/fixtures/telegram/fake-telegram-bot.fixture.js';
import { createLiveRun, LEAD_IN_CANDLES, type LiveUser } from '../live-test/live-test-context.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { CHAT_OF_F, SECOND } from './telegram-test.constant.js';
import {
  assertCondition,
  dispatchUntilQuiet,
  readAlerts,
  reportTelegramLine,
  type AlertRow,
  type TelegramTestContext,
} from './telegram-test-context.js';

let nextCandle = 1_700_000_000_000;

type Seed = { readonly user: LiveUser; readonly runId: string; readonly count?: number };

async function enqueue(context: TelegramTestContext, seed: Seed): Promise<readonly AlertRow[]> {
  const payload: JsonContainer = alertPayload();
  const drafts = Array.from({ length: seed.count ?? 1 }, () => {
    nextCandle += 3_600_000;
    return { candleTime: nextCandle, side: 'BUY', payload } as const;
  });
  const written = await createRunBatchRepository(context.live.handle).runInBatch(
    seed.user.scope,
    seed.runId,
    (writer) => writer.appendAlerts(drafts),
  );
  assertCondition(written?.written === drafts.length, 'alerta de teste não foi enfileirado');
  const rows = await readAlerts(context, { runId: seed.runId });
  return rows.filter((row) => drafts.some((draft) => String(draft.candleTime) === row.candle_time));
}

async function reload(context: TelegramTestContext, row: AlertRow): Promise<AlertRow> {
  const found = (await readAlerts(context, { runId: row.run_id })).find(
    (item) => item.id === row.id,
  );
  if (found === undefined) throw new Error('alerta sumiu');
  return found;
}

async function checkBackoff(context: TelegramTestContext, seed: Seed): Promise<void> {
  const [alert] = await enqueue(context, seed);
  if (alert === undefined) throw new Error('sem alerta');
  context.bot.script(telegramError(503), telegramError(503));
  const before = context.bot.requests.length;
  await context.dispatcher.tick();
  const first = await reload(context, alert);
  assertCondition(first.status === 'pending' && first.attempts === 1, 'não ficou pendente');
  assertCondition(first.last_error === 'http_5xx', `código gravado: ${first.last_error}`);
  assertCondition(
    first.next_attempt_at.getTime() === context.clock.now + 30 * SECOND,
    'a primeira espera não é de 30 s',
  );
  assertCondition((await context.dispatcher.tick()).claimed === 0, 'bateu antes da hora');
  context.clock.now += 30 * SECOND;
  await context.dispatcher.tick();
  const second = await reload(context, alert);
  assertCondition(
    second.next_attempt_at.getTime() === context.clock.now + 60 * SECOND,
    'a segunda espera não é de 60 s',
  );
  context.clock.now += 60 * SECOND;
  await context.dispatcher.tick();
  const done = await reload(context, alert);
  assertCondition(done.status === 'sent' && done.attempts === 3, 'não entregou na terceira');
  assertCondition(context.bot.requests.length - before === 3, 'tentativas a mais ou a menos');
  assertCondition(done.last_error === null && done.sent_at !== null, 'estado final incoerente');
}

async function checkRateLimit(context: TelegramTestContext, seed: Seed): Promise<void> {
  const [alert] = await enqueue(context, seed);
  if (alert === undefined) throw new Error('sem alerta');
  context.bot.script(rateLimited(120));
  await context.dispatcher.tick();
  const waiting = await reload(context, alert);
  assertCondition(
    waiting.next_attempt_at.getTime() === context.clock.now + 120 * SECOND,
    'o retry_after de 120 s não foi respeitado',
  );
  context.clock.now += 120 * SECOND;
  await context.dispatcher.tick();
  assertCondition((await reload(context, alert)).status === 'sent', 'não entregou depois do 429');
}

async function checkGivingUp(context: TelegramTestContext, seed: Seed): Promise<void> {
  const [exhausted] = await enqueue(context, seed);
  if (exhausted === undefined) throw new Error('sem alerta');
  context.bot.script(...Array.from({ length: 5 }, () => telegramError(503)));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await context.dispatcher.tick();
    context.clock.now += 240 * SECOND;
  }
  const failed = await reload(context, exhausted);
  assertCondition(
    failed.status === 'failed' && failed.attempts === 5 && failed.last_error === 'http_5xx',
    `esgotado deveria ser failed/5/http_5xx: ${failed.status}/${failed.attempts}/${failed.last_error}`,
  );
  const requests = context.bot.requests.length;
  context.clock.now += 86_400 * SECOND;
  await context.dispatcher.tick();
  assertCondition(context.bot.requests.length === requests, 'insistiu depois de desistir');
  const [next] = await enqueue(context, seed);
  if (next === undefined) throw new Error('sem alerta');
  await context.dispatcher.tick();
  assertCondition((await reload(context, next)).status === 'sent', 'o alerta seguinte não saiu');
}

async function checkRefusal(context: TelegramTestContext, seed: Seed): Promise<void> {
  const [alert] = await enqueue(context, seed);
  if (alert === undefined) throw new Error('sem alerta');
  context.bot.script(telegramError(403, 'bot was blocked by the user'));
  await context.dispatcher.tick();
  const row = await reload(context, alert);
  assertCondition(
    row.status === 'failed' && row.attempts === 1 && row.last_error === 'http_403',
    'recusa 403 deveria falhar de vez na primeira tentativa',
  );
}

async function checkTelegramDown(context: TelegramTestContext, seed: Seed): Promise<void> {
  const dead = startFakeTelegramBot();
  const baseUrl = dead.baseUrl;
  await dead.stop();
  const dispatcher = createAlertDispatcher({
    alerts: createAlertRepository(context.live.handle),
    client: createTelegramClient({ apiBaseUrl: baseUrl, botToken: BOT_TOKEN }),
    logger: createWorkerLogger({
      appName: 'worker-telegram-test',
      write: (l) => void context.logLines.push(l),
    }),
    now: () => context.clock.now,
  });
  const [alert] = await enqueue(context, seed);
  if (alert === undefined) throw new Error('sem alerta');
  const summary = await dispatcher.tick();
  const row = await reload(context, alert);
  assertCondition(
    summary.retried === 1 && row.last_error === 'network',
    'rede fora do ar não repetiu',
  );
  context.clock.now += 30 * SECOND;
  await context.dispatcher.tick();
  assertCondition((await reload(context, alert)).status === 'sent', 'não entregou quando voltou');
}

async function checkTwoDispatchers(context: TelegramTestContext, seed: Seed): Promise<void> {
  const total = 24;
  await enqueue(context, { ...seed, count: total });
  const before = context.bot.requests.length;
  const rounds = await Promise.all(Array.from({ length: 6 }, () => context.dispatcher.tick()));
  const claimed = rounds.reduce((sum, round) => sum + round.claimed, 0);
  assertCondition(claimed <= total, `seis despachantes reivindicaram ${claimed} de ${total}`);
  for (let round = 0; round < 10; round += 1) await context.dispatcher.tick();
  const sent = context.bot.requests.length - before;
  assertCondition(sent === total, `${total} alertas viraram ${sent} mensagens`);
}

export async function checkRetryAndRaces(
  context: TelegramTestContext,
  user: LiveUser,
): Promise<void> {
  const dataset = REAL_DATASETS[0];
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || first === undefined) throw new Error('conjunto real ausente');
  const { symbol } = dataset.market;
  const run = await createLiveRun(context.live, {
    symbol,
    timeframe: '1h',
    periodStart: first.openTime,
    user,
  });
  // Caixa limpa: o que sobrou de outras etapas (alertas de G, por exemplo) sai antes, para a contagem ser só desta.
  await dispatchUntilQuiet(context);
  const seed = { user, runId: run.id };
  assertCondition(CHAT_OF_F.length > 0, 'chat de F');
  await checkBackoff(context, seed);
  await checkRateLimit(context, seed);
  await checkGivingUp(context, seed);
  await checkRefusal(context, seed);
  await checkTelegramDown(context, seed);
  await checkTwoDispatchers(context, seed);
  reportTelegramLine(
    'falhas: 503 → espera de 30 s e 60 s e entrega na 3ª; 429 respeita retry_after de 120 s; 5 falhas desistem sem insistir; 403 falha de vez; Telegram fora do ar não lança; 6 despachantes simultâneos entregam 24 alertas uma vez cada',
  );
}
