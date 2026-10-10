// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { PAGE_SIZE } from './backfill-test.constant.js';
import {
  countCandles,
  readCount,
  reportCheck,
  runForContext,
  type BackfillContext,
} from './backfill-test-context.js';
import { computeGridWindow, pagesFor, waitForSafeClock } from './grid-oracle.js';

const SYMBOL = 'TWOYEARUSDT';
const YEARS = 2;

export async function checkTwoYearsOfDailyAndHourly(context: BackfillContext): Promise<void> {
  await waitForSafeClock();
  const now = Date.now();
  const hourly = computeGridWindow({ now, years: YEARS, timeframe: '1h' });
  const daily = computeGridWindow({ now, years: YEARS, timeframe: '1d' });
  const expectedRequests = pagesFor(hourly.count, PAGE_SIZE) + pagesFor(daily.count, PAGE_SIZE);

  context.server.resetRequests();
  const run = await runForContext(context, {
    symbols: [SYMBOL],
    timeframes: ['1h', '1d'],
    years: YEARS,
  });
  assertCondition(run.exitCode === 0, `o cron saiu com ${run.exitCode}: ${run.output}`);
  const requests = context.server.requests;
  assertCondition(
    requests.length === expectedRequests,
    `chamadas ${requests.length}, esperado ${expectedRequests}`,
  );
  assertCondition(
    requests.every((request) => request.limit === PAGE_SIZE),
    'limit diferente de 1000',
  );
  assertCondition(
    readCount(run, 'inserted') === hourly.count + daily.count,
    'total inserido diferente do esperado',
  );
  assertCondition(
    (await countCandles(context, { symbol: SYMBOL, timeframe: '1h' })) === hourly.count,
    'contagem de 1h',
  );
  assertCondition(
    (await countCandles(context, { symbol: SYMBOL, timeframe: '1d' })) === daily.count,
    'contagem de 1d',
  );
  reportCheck(
    `2 anos de 1h (${hourly.count}) e 1d (${daily.count}) para um símbolo -> ${requests.length} chamadas de 1000 (esperado ${expectedRequests})`,
  );
}
