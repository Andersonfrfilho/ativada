// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { DURATION_MILLISECONDS, PAGE_SIZE } from './backfill-test.constant.js';
import {
  countCandles,
  readCount,
  reportCheck,
  runForContext,
  type BackfillContext,
} from './backfill-test-context.js';
import { computeGridWindow, pagesFor, waitForSafeClock } from './grid-oracle.js';

const SYMBOL = 'XRPUSDT';
const TIMEFRAME = '1h';
const YEARS = 1;
const FAILING_REQUEST_NUMBER = 3;
const PERSISTED_PAGES = FAILING_REQUEST_NUMBER - 1;

export async function checkResumeAfterFailure(context: BackfillContext): Promise<void> {
  await waitForSafeClock();
  const window = computeGridWindow({ now: Date.now(), years: YEARS, timeframe: TIMEFRAME });
  const persistedCount = PERSISTED_PAGES * PAGE_SIZE;
  const series = { symbol: SYMBOL, timeframe: TIMEFRAME } as const;

  context.server.resetRequests();
  context.server.failFromRequest = FAILING_REQUEST_NUMBER;
  const failed = await runForContext(context, {
    symbols: [SYMBOL],
    timeframes: [TIMEFRAME],
    years: YEARS,
  });
  context.server.failFromRequest = undefined;
  assertCondition(failed.exitCode === 1, `a queda no meio deveria sair 1, saiu ${failed.exitCode}`);
  assertCondition(readCount(failed, 'failures') === 1, 'o resumo não conta a falha do par');
  const afterFailure = await countCandles(context, series);
  assertCondition(afterFailure === persistedCount, `páginas 1-2 persistidas: ${afterFailure}`);
  reportCheck(
    `servidor falha na 3ª chamada -> cron sai 1 e as ${persistedCount} velas das páginas 1-2 estão no banco`,
  );

  context.server.resetRequests();
  const resumed = await runForContext(context, {
    symbols: [SYMBOL],
    timeframes: [TIMEFRAME],
    years: YEARS,
  });
  assertCondition(
    resumed.exitCode === 0,
    `a retomada saiu com ${resumed.exitCode}: ${resumed.output}`,
  );
  const resumeFrom = window.from + persistedCount * DURATION_MILLISECONDS[TIMEFRAME];
  const requests = context.server.requests;
  assertCondition(requests[0]?.startTime === resumeFrom, 'a retomada não começou onde parou');
  assertCondition(
    requests.every((request) => request.startTime >= resumeFrom),
    'rebaixou páginas 1-2',
  );
  const expectedRequests = pagesFor(window.count - persistedCount, PAGE_SIZE);
  assertCondition(
    requests.length === expectedRequests,
    `chamadas ${requests.length}, esperado ${expectedRequests}`,
  );
  assertCondition(
    readCount(resumed, 'inserted') === window.count - persistedCount,
    'inseridos na retomada',
  );
  assertCondition(
    (await countCandles(context, series)) === window.count,
    'grade incompleta após a retomada',
  );
  reportCheck(
    `retomada a partir da vela ${persistedCount}: ${requests.length} chamadas, nenhuma rebaixou as páginas 1-2, grade completa`,
  );
}
