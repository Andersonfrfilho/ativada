// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { DURATION_MILLISECONDS } from './backfill-test.constant.js';
import {
  countCandles,
  readCount,
  reportCheck,
  runForContext,
  seedGrid,
  type BackfillContext,
} from './backfill-test-context.js';
import { computeGridWindow, waitForSafeClock } from './grid-oracle.js';

const SYMBOL = 'LINKUSDT';
const TIMEFRAME = '4h';
const YEARS = 1;
const HOLE_START_INDEX = 700;
const HOLE_LENGTH = 3;

export async function checkUnfillableGapIsReportedOnce(context: BackfillContext): Promise<void> {
  await waitForSafeClock();
  const window = computeGridWindow({ now: Date.now(), years: YEARS, timeframe: TIMEFRAME });
  const duration = DURATION_MILLISECONDS[TIMEFRAME];
  const hole = Array.from(
    { length: HOLE_LENGTH },
    (_unused, offset) => window.from + (HOLE_START_INDEX + offset) * duration,
  );
  await seedGrid(context, {
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    from: window.from,
    to: window.to,
    skippedOpenTimes: new Set(hole),
  });
  context.server.withheld.push({
    symbol: SYMBOL,
    interval: TIMEFRAME,
    fromOpenTime: hole[0] ?? 0,
    toOpenTime: hole.at(-1) ?? 0,
  });

  context.server.resetRequests();
  const run = await runForContext(context, {
    symbols: [SYMBOL],
    timeframes: [TIMEFRAME],
    years: YEARS,
  });
  assertCondition(run.exitCode === 0, `lacuna sem dado não é falha, mas saiu ${run.exitCode}`);
  assertCondition(
    context.server.requests.length === 1,
    `chamadas ${context.server.requests.length}`,
  );
  assertCondition(readCount(run, 'unfillable') === 1, 'o resumo deveria trazer 1 lacuna sem dado');
  const gapId = `${SYMBOL}/${TIMEFRAME}/${hole[0]}-${hole.at(-1)}`;
  assertCondition(run.output.includes(gapId), 'o log não identifica a lacuna');
  assertCondition(
    (await countCandles(context, { symbol: SYMBOL, timeframe: TIMEFRAME })) ===
      window.count - HOLE_LENGTH,
    'a contagem mudou',
  );
  reportCheck(
    `lacuna que a Binance não tem -> 1 chamada, 1 unfillable no log (${gapId}), sem laço, saída 0`,
  );
}
