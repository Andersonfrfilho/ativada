// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { DURATION_MILLISECONDS, PAGE_SIZE } from './backfill-test.constant.js';
import {
  countCandles,
  readCount,
  reportCheck,
  runForContext,
  seedGrid,
  type BackfillContext,
} from './backfill-test-context.js';
import { computeGridWindow, waitForSafeClock } from './grid-oracle.js';

const SYMBOL = 'DOGEUSDT';
const TIMEFRAME = '1h';
const YEARS = 1;
const WIDE_HOLE_START_INDEX = 3_000;
const WIDE_HOLE_LENGTH = 37;
const SINGLE_HOLE_INDEX = 5_000;

export async function checkHoleIsFilledAndRerunIsIdle(context: BackfillContext): Promise<void> {
  await waitForSafeClock();
  const window = computeGridWindow({ now: Date.now(), years: YEARS, timeframe: TIMEFRAME });
  const duration = DURATION_MILLISECONDS[TIMEFRAME];
  const wideHole = Array.from(
    { length: WIDE_HOLE_LENGTH },
    (_unused, offset) => window.from + (WIDE_HOLE_START_INDEX + offset) * duration,
  );
  const singleHole = window.from + SINGLE_HOLE_INDEX * duration;
  const seeded = await seedGrid(context, {
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    from: window.from,
    to: window.to,
    skippedOpenTimes: new Set([...wideHole, singleHole]),
  });
  const holeCount = wideHole.length + 1;
  assertCondition(seeded === window.count - holeCount, `semeadura inseriu ${seeded}`);

  context.server.resetRequests();
  const first = await runForContext(context, {
    symbols: [SYMBOL],
    timeframes: [TIMEFRAME],
    years: YEARS,
  });
  assertCondition(first.exitCode === 0, `o cron saiu com ${first.exitCode}: ${first.output}`);
  const requests = context.server.requests;
  assertCondition(requests.length === 2, `esperado 2 chamadas, houve ${requests.length}`);
  assertCondition(
    requests[0]?.startTime === wideHole[0] && requests[0]?.endTime === wideHole.at(-1),
    'a primeira chamada não cobre exatamente o buraco largo',
  );
  assertCondition(
    requests[1]?.startTime === singleHole && requests[1]?.endTime === singleHole,
    'a segunda chamada não cobre exatamente o buraco de um candle',
  );
  assertCondition(
    requests.every((request) => request.limit === PAGE_SIZE),
    'limit diferente de 1000',
  );
  assertCondition(
    readCount(first, 'inserted') === holeCount,
    `inseridos ${readCount(first, 'inserted')}`,
  );
  const total = await countCandles(context, { symbol: SYMBOL, timeframe: TIMEFRAME });
  assertCondition(total === window.count, `contagem ${total}, esperado ${window.count}`);
  const stillMissing = await context.repository.findMissingOpenTimes({
    exchange: 'binance',
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    from: window.from,
    to: window.to,
  });
  assertCondition(stillMissing.length === 0, `ainda faltam ${stillMissing.length} candles`);
  reportCheck(
    `buraco de ${holeCount} candles em 2 intervalos -> 2 chamadas, ${holeCount} inseridos, grade completa (${total})`,
  );

  context.server.resetRequests();
  const second = await runForContext(context, {
    symbols: [SYMBOL],
    timeframes: [TIMEFRAME],
    years: YEARS,
  });
  assertCondition(second.exitCode === 0, `reexecução saiu com ${second.exitCode}`);
  assertCondition(context.server.requests.length === 0, 'a reexecução chamou a Binance');
  assertCondition(readCount(second, 'inserted') === 0, 'a reexecução inseriu candles');
  assertCondition(
    (await countCandles(context, { symbol: SYMBOL, timeframe: TIMEFRAME })) === total,
    'a contagem mudou',
  );
  reportCheck('segunda execução com a grade completa -> 0 chamadas, 0 inserções, contagem igual');
}
