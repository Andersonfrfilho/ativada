// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  DISPLAY_BACKFILL_TASK_NAME,
  DISPLAY_PURGE_TASK_NAME,
  PAGE_SIZE,
} from './backfill-test.constant.js';
import {
  countCandles,
  readCount,
  reportCheck,
  seedGrid,
  type BackfillContext,
} from './backfill-test-context.js';
import { computeGridWindowInDays, pagesFor } from './grid-oracle.js';
import { runCronTask, type BackfillRun } from './run-backfill.js';

const SYMBOL = 'SOLUSDT';
const EXECUTION_SEED_COUNT = 100;
const RETENTION_DAYS = 90;
const SHORT_RETENTION_DAYS = 7;
const WEIGHT_PER_KLINES_REQUEST = 2;
const THREE_MINUTES = 180_000;
const SAFE_MARGIN_MILLISECONDS = 25_000;

// A janela do cron vira a cada 3 min; começar longe da virada evita um falso vermelho.
async function waitForSafeThreeMinuteClock(): Promise<void> {
  const intoCandle = Date.now() % THREE_MINUTES;
  if (intoCandle > 2_000 && intoCandle < THREE_MINUTES - SAFE_MARGIN_MILLISECONDS) return;
  const untilSafe = THREE_MINUTES - intoCandle + 2_000;
  await Bun.sleep(untilSafe);
}

function runDisplayTask(
  context: BackfillContext,
  taskName: string,
  retentionDays: number,
): Promise<BackfillRun> {
  return runCronTask({
    taskName,
    environment: {
      DATABASE_URL: context.databaseUrl,
      BINANCE_BASE_URL: context.server.baseUrl,
      MARKET_SYMBOLS: SYMBOL,
      MARKET_DISPLAY_TIMEFRAMES: '3m',
      CANDLE_DISPLAY_RETENTION_DAYS: String(retentionDays),
    },
  });
}

export async function checkDisplayCandlesBackfillAndPurge(context: BackfillContext): Promise<void> {
  await waitForSafeThreeMinuteClock();
  const window = computeGridWindowInDays({
    now: Date.now(),
    days: RETENTION_DAYS,
    timeframe: '3m',
  });
  const expectedRequests = pagesFor(window.count, PAGE_SIZE);

  context.server.resetRequests();
  const first = await runDisplayTask(context, DISPLAY_BACKFILL_TASK_NAME, RETENTION_DAYS);
  assertCondition(first.exitCode === 0, `o cron saiu com ${first.exitCode}: ${first.output}`);
  assertCondition(
    context.server.requests.length === expectedRequests,
    `chamadas ${context.server.requests.length}, esperado ${expectedRequests}`,
  );
  assertCondition(readCount(first, 'inserted') === window.count, 'total inserido diferente');
  assertCondition(
    (await countCandles(context, { symbol: SYMBOL, timeframe: '3m' })) === window.count,
    'contagem de 3m',
  );
  reportCheck(
    `${RETENTION_DAYS} dias de 3m (${window.count}) -> ${expectedRequests} chamadas de ${PAGE_SIZE}, peso ${expectedRequests * WEIGHT_PER_KLINES_REQUEST}`,
  );

  context.server.resetRequests();
  const rerun = await runDisplayTask(context, DISPLAY_BACKFILL_TASK_NAME, RETENTION_DAYS);
  assertCondition(rerun.exitCode === 0, `o segundo cron saiu com ${rerun.exitCode}`);
  assertCondition(context.server.requests.length === 0, 'o segundo backfill pediu algo');
  assertCondition(readCount(rerun, 'inserted') === 0, 'o segundo backfill inseriu algo');
  reportCheck('segundo backfill de 3m: zero chamadas, zero inseridas');

  const hour = 3_600_000;
  const executionFrom =
    Math.floor(Date.now() / hour) * hour - EXECUTION_SEED_COUNT * 30 * 24 * hour;
  await seedGrid(context, {
    symbol: SYMBOL,
    timeframe: '1h',
    from: executionFrom,
    to: executionFrom + EXECUTION_SEED_COUNT * hour,
    skippedOpenTimes: new Set(),
  });
  const executionBefore = await countCandles(context, { symbol: SYMBOL, timeframe: '1h' });
  assertCondition(executionBefore === EXECUTION_SEED_COUNT, 'semente de 1h antiga não gravou');
  const purge = await runDisplayTask(context, DISPLAY_PURGE_TASK_NAME, SHORT_RETENTION_DAYS);
  assertCondition(purge.exitCode === 0, `a limpeza saiu com ${purge.exitCode}: ${purge.output}`);
  const kept = await countCandles(context, { symbol: SYMBOL, timeframe: '3m' });
  const cutoff = computeGridWindowInDays({
    now: Date.now(),
    days: SHORT_RETENTION_DAYS,
    timeframe: '3m',
  });
  assertCondition(
    Math.abs(kept - cutoff.count) <= 1,
    `sobraram ${kept} velas 3m, esperado cerca de ${cutoff.count}`,
  );
  assertCondition(readCount(purge, 'deleted') === window.count - kept, 'apagadas diferente');
  assertCondition(
    (await countCandles(context, { symbol: SYMBOL, timeframe: '1h' })) === executionBefore,
    'a limpeza tocou em vela de execução',
  );
  reportCheck(`limpeza com ${SHORT_RETENTION_DAYS} dias: ficaram ${kept} velas 3m, 1h intacta`);
}
