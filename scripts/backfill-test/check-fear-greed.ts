// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  FEAR_GREED_HISTORY_DAYS,
  FEAR_GREED_REFRESH_DAYS,
  FEAR_GREED_TASK_NAME,
  MILLISECONDS_PER_DAY,
} from './backfill-test.constant.js';
import { readCount, reportCheck, type BackfillContext } from './backfill-test-context.js';
import { startFakeFearGreedServer, type FakeFearGreedServer } from './fake-fear-greed-server.js';
import { runCronTask, type BackfillRun } from './run-backfill.js';

const FIRST_TODAY_VALUE = 31;
const SECOND_TODAY_VALUE = 87;
const UNTOUCHED_DAYS_AGO = 20;

type TotalRow = { readonly total: number };
type ValueRow = { readonly value: number };

function runSync(context: BackfillContext, server: FakeFearGreedServer): Promise<BackfillRun> {
  return runCronTask({
    taskName: FEAR_GREED_TASK_NAME,
    environment: {
      DATABASE_URL: context.databaseUrl,
      FEAR_GREED_API_URL: server.baseUrl,
      FEAR_GREED_REFRESH_DAYS: String(FEAR_GREED_REFRESH_DAYS),
    },
  });
}

async function countRows(context: BackfillContext): Promise<number> {
  const rows: unknown = await context.sql`SELECT count(*)::int AS total FROM sentiment_daily`;
  return (rows as readonly TotalRow[])[0]?.total ?? 0;
}

async function readStoredValue(context: BackfillContext, date: string): Promise<number> {
  const rows: unknown =
    await context.sql`SELECT fear_greed AS value FROM sentiment_daily WHERE date = ${date}::date`;
  return (rows as readonly ValueRow[])[0]?.value ?? -1;
}

function dateDaysAgo(server: FakeFearGreedServer, daysAgo: number): string {
  return new Date(Date.parse(server.todayDate) - daysAgo * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, server.todayDate.length);
}

async function checkFirstRunLoadsEverything(
  context: BackfillContext,
  server: FakeFearGreedServer,
): Promise<void> {
  server.todayValue = FIRST_TODAY_VALUE;
  const run = await runSync(context, server);
  assertCondition(run.exitCode === 0, `primeira execução saiu ${run.exitCode}: ${run.output}`);
  assertCondition(
    server.requestedLimits.length === 1 && server.requestedLimits[0] === 0,
    `limites pedidos ${server.requestedLimits.join(',')}; esperado só 0`,
  );
  assertCondition(readCount(run, 'fullHistory') === 1, 'o resumo não marca histórico completo');
  const total = await countRows(context);
  assertCondition(total === FEAR_GREED_HISTORY_DAYS, `linhas ${total}`);
  reportCheck(`Fear & Greed: tabela vazia -> limit=0, ${total} dias gravados, saída 0`);
}

async function checkSecondRunRefreshesToday(
  context: BackfillContext,
  server: FakeFearGreedServer,
): Promise<void> {
  server.resetRequests();
  server.todayValue = SECOND_TODAY_VALUE;
  const run = await runSync(context, server);
  assertCondition(run.exitCode === 0, `segunda execução saiu ${run.exitCode}: ${run.output}`);
  assertCondition(
    server.requestedLimits.length === 1 && server.requestedLimits[0] === FEAR_GREED_REFRESH_DAYS,
    `limites pedidos ${server.requestedLimits.join(',')}; esperado só ${FEAR_GREED_REFRESH_DAYS}`,
  );
  assertCondition(readCount(run, 'fullHistory') === 0, 'o resumo deveria ser de atualização');
  assertCondition(readCount(run, 'fetched') === FEAR_GREED_REFRESH_DAYS, 'dias buscados errados');
  const total = await countRows(context);
  assertCondition(total === FEAR_GREED_HISTORY_DAYS, `linhas duplicadas ou perdidas: ${total}`);
  const today = await readStoredValue(context, server.todayDate);
  assertCondition(today === SECOND_TODAY_VALUE, `valor do dia ${today}; esperado atualizado`);
  const older = await readStoredValue(context, dateDaysAgo(server, UNTOUCHED_DAYS_AGO));
  assertCondition(older === server.valueOf(UNTOUCHED_DAYS_AGO), 'dia antigo foi alterado');
  reportCheck(
    `Fear & Greed: tabela com dados -> limit=${FEAR_GREED_REFRESH_DAYS}, valor do dia atualizado ${FIRST_TODAY_VALUE} -> ${today}, ${total} linhas sem duplicata`,
  );
}

async function checkSourceDownLeavesDataIntact(
  context: BackfillContext,
  server: FakeFearGreedServer,
): Promise<void> {
  server.resetRequests();
  server.todayValue = FIRST_TODAY_VALUE;
  server.isFailing = true;
  const run = await runSync(context, server);
  assertCondition(run.exitCode === 1, `fonte fora do ar deveria sair 1, saiu ${run.exitCode}`);
  assertCondition(run.output.includes('MarketDataHttpError'), 'o log não nomeia o erro');
  const total = await countRows(context);
  assertCondition(total === FEAR_GREED_HISTORY_DAYS, `a contagem mudou: ${total}`);
  const today = await readStoredValue(context, server.todayDate);
  assertCondition(today === SECOND_TODAY_VALUE, `a falha alterou o valor do dia: ${today}`);
  reportCheck('Fear & Greed: fonte fora do ar -> cron sai 1, tabela intacta');
}

export async function checkFearGreedSync(context: BackfillContext): Promise<void> {
  const server = startFakeFearGreedServer();
  try {
    await checkFirstRunLoadsEverything(context, server);
    await checkSecondRunRefreshesToday(context, server);
    await checkSourceDownLeavesDataIntact(context, server);
  } finally {
    await server.stop();
  }
}
