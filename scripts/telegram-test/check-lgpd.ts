// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createAccountDeletionRepository,
  createAccountExportRepository,
  createAccountPurgeRepository,
  createRunBatchRepository,
  createTelegramLinkRepository,
} from '../../packages/database/src/index.js';
import { alertPayload } from '../../test/fixtures/telegram/alert-payload.fixture.js';
import type { LiveUser } from '../live-test/live-test-context.js';
import type { DeliveryRuns } from './check-delivery.js';
import { CHAT_OF_A, CHAT_OF_B } from './telegram-test.constant.js';
import {
  assertCondition,
  readAlerts,
  reportTelegramLine,
  type TelegramTestContext,
} from './telegram-test-context.js';

type LgpdUsers = { readonly a: LiveUser; readonly b: LiveUser };

async function readChat(context: TelegramTestContext, user: LiveUser): Promise<string | null> {
  const rows: unknown = await context.live.client`SELECT telegram_chat_id FROM users
    WHERE keycloak_sub = ${user.subject}`;
  return (rows as readonly { telegram_chat_id: string | null }[])[0]?.telegram_chat_id ?? null;
}

async function checkExport(
  context: TelegramTestContext,
  params: { readonly users: LgpdUsers; readonly runs: DeliveryRuns },
): Promise<number> {
  const exports = createAccountExportRepository(context.live.handle);
  const data = await exports.exportOwnerData(params.users.a.scope);
  if (data === undefined) throw new Error('exportação de A vazia');
  const alertsOfA = await readAlerts(context, { runId: params.runs.a.id });
  const exported = data.tables['alerts'] ?? [];
  assertCondition(
    data.account['telegramChatId'] === CHAT_OF_A,
    'o chat de A não está na exportação',
  );
  assertCondition(exported.length === alertsOfA.length, `alertas exportados: ${exported.length}`);
  const text = JSON.stringify(data);
  for (const foreign of [CHAT_OF_B, 'ETHUSDT', params.users.b.subject]) {
    assertCondition(!text.includes(foreign), `a exportação de A vazou ${foreign}`);
  }
  for (const technical of ['lockedUntil', 'locked_until', 'user_id']) {
    assertCondition(!text.includes(technical), `a exportação carregou ${technical}`);
  }
  return alertsOfA.length;
}

async function checkUnlink(
  context: TelegramTestContext,
  params: { readonly users: LgpdUsers; readonly runs: DeliveryRuns },
): Promise<void> {
  await createTelegramLinkRepository(context.live.handle).unlink(params.users.a.scope);
  assertCondition(
    (await readChat(context, params.users.a)) === null,
    'o chat de A não foi apagado',
  );
  const exports = createAccountExportRepository(context.live.handle);
  const data = await exports.exportOwnerData(params.users.a.scope);
  assertCondition(data?.account['telegramChatId'] === null, 'a exportação ainda tem o chat de A');
  const written = await createRunBatchRepository(context.live.handle).runInBatch(
    params.users.a.scope,
    params.runs.a.id,
    (writer) => writer.appendAlerts([{ candleTime: 1, side: 'BUY', payload: alertPayload() }]),
  );
  assertCondition(written?.written === 0, 'enfileirou alerta para quem desvinculou');
}

async function checkPurge(
  context: TelegramTestContext,
  params: { readonly users: LgpdUsers; readonly runs: DeliveryRuns; readonly keptOfA: number },
): Promise<void> {
  const deletions = createAccountDeletionRepository(context.live.handle);
  await deletions.markDeleted(params.users.b.scope);
  await createAccountPurgeRepository(context.live.handle).purgeAccountData(params.users.b.scope);
  assertCondition(
    (await readAlerts(context, { runId: params.runs.b.id })).length === 0,
    'restaram alertas de B depois da exclusão',
  );
  assertCondition((await readChat(context, params.users.b)) === null, 'o chat de B ficou');
  assertCondition(
    (await readAlerts(context, { runId: params.runs.a.id })).length === params.keptOfA,
    'a exclusão de B tocou nos alertas de A',
  );
  const sent = context.bot.requests.length;
  await context.dispatcher.tick();
  assertCondition(context.bot.requests.length === sent, 'enviou algo depois da exclusão');
}

export async function checkLgpd(
  context: TelegramTestContext,
  params: { readonly users: LgpdUsers; readonly runs: DeliveryRuns },
): Promise<void> {
  const keptOfA = await checkExport(context, params);
  await checkUnlink(context, params);
  await checkPurge(context, { ...params, keptOfA });
  reportTelegramLine(
    `LGPD: a exportação de A leva o chat e os ${keptOfA} alertas dela (sem nada de B, sem o arrendamento); desvincular apaga o chat e nada mais é enfileirado; apagar B esvazia os alertas e o chat dele e deixa os de A`,
  );
}
