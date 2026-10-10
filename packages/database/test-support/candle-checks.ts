// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CLOCK_SKEW_TOLERANCE_MILLISECONDS } from '../src/candles/candle.constant.js';
import { createCandleRepository } from '../src/candles/candle.repository.js';
import { OpenCandleRejectedError } from '../src/candles/open-candle-rejected.error.js';
import type { CandleRecord } from '../src/candles/candle.types.js';
import type { DatabaseHandle } from '../src/database-handle.js';
import { readPostgresErrorCode } from '../src/postgres-error-code.js';

const NOW_MILLISECONDS = 1_800_000_000_000;
const FIRST_OPEN_TIME = 1_600_000_000_000;
const ONE_HOUR = 3_600_000;
const CHECK_VIOLATION_SQLSTATE = '23514';
const BULK_CANDLE_COUNT = 2_500;
const EXACT_PRICE = '82514.01000000';

export type CandleCheckContext = {
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly assertCondition: (condition: boolean, message: string) => void;
  readonly reportCheck: (message: string) => void;
};

type CountRow = { readonly total: number };

function buildCandle(symbol: string, hourIndex: number): CandleRecord {
  const openTime = FIRST_OPEN_TIME + hourIndex * ONE_HOUR;
  return {
    exchange: 'binance',
    symbol,
    timeframe: '1h',
    openTime,
    closeTime: openTime + ONE_HOUR - 1,
    open: EXACT_PRICE,
    high: '82600.00000000',
    low: '82400.00000000',
    close: '82500.12345678',
    volume: '12345678901234567890.12345678',
    tradeCount: 100 + hourIndex,
  };
}

async function countCandles(client: Bun.SQL, symbol: string): Promise<number> {
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM candles WHERE symbol = ${symbol}`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

async function readRejectionCode(attempt: Promise<unknown>): Promise<string | undefined> {
  try {
    await attempt;
    return undefined;
  } catch (error: unknown) {
    return readPostgresErrorCode(error);
  }
}

async function checkIdempotentUpsert(context: CandleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });
  const batch = [0, 1, 2].map((hourIndex) => buildCandle('IDEMPOTENTUSDT', hourIndex));
  const first = await repository.upsertCandles(batch);
  const second = await repository.upsertCandles(batch);
  const total = await countCandles(client, 'IDEMPOTENTUSDT');
  assertCondition(first.inserted === 3, `primeiro upsert inseriu ${first.inserted}`);
  assertCondition(second.inserted === 0, `segundo upsert inseriu ${second.inserted}`);
  assertCondition(total === 3, `contagem mudou: ${total}`);
  const rewritten = { ...buildCandle('IDEMPOTENTUSDT', 0), close: '82550.00000000' };
  const third = await repository.upsertCandles([rewritten]);
  const [stored] = await repository.findCandles({
    exchange: 'binance',
    symbol: 'IDEMPOTENTUSDT',
    timeframe: '1h',
    from: FIRST_OPEN_TIME,
    to: FIRST_OPEN_TIME + ONE_HOUR,
  });
  assertCondition(third.inserted === 0, 'candle fechado foi reinserido');
  assertCondition(stored?.close === '82500.12345678', 'candle fechado foi sobrescrito');
  reportCheck('upsert do mesmo lote duas vezes -> inserted = 0, contagem e valor inalterados');
}

async function checkExactRoundTrip(context: CandleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });
  const original = buildCandle('ROUNDTRIPUSDT', 0);
  await repository.upsertCandles([original]);
  const [stored] = await repository.findCandles({
    exchange: 'binance',
    symbol: 'ROUNDTRIPUSDT',
    timeframe: '1h',
    from: original.openTime,
    to: original.openTime + 1,
  });
  assertCondition(JSON.stringify(stored) === JSON.stringify(original), 'round trip diferente');
  assertCondition(stored?.open === EXACT_PRICE, 'preço decimal não voltou idêntico');
  reportCheck(`round trip exato: '${EXACT_PRICE}' volta idêntico, volume de 20 dígitos também`);
}

async function checkRangeAndLatest(context: CandleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });
  const symbol = 'RANGEUSDT';
  await repository.upsertCandles(
    [4, 0, 3, 1, 2].map((hourIndex) => buildCandle(symbol, hourIndex)),
  );
  const key = { exchange: 'binance', symbol, timeframe: '1h' } as const;
  const found = await repository.findCandles({
    ...key,
    from: FIRST_OPEN_TIME + ONE_HOUR,
    to: FIRST_OPEN_TIME + 4 * ONE_HOUR,
  });
  const openTimes = found.map((candle) => candle.openTime - FIRST_OPEN_TIME);
  assertCondition(
    JSON.stringify(openTimes) === JSON.stringify([ONE_HOUR, 2 * ONE_HOUR, 3 * ONE_HOUR]),
    `intervalo [from, to) ou ordem errados: ${openTimes.join(',')}`,
  );
  const latest = await repository.findLatestOpenTime(key);
  const absent = await repository.findLatestOpenTime({ ...key, symbol: 'ABSENTUSDT' });
  assertCondition(latest === FIRST_OPEN_TIME + 4 * ONE_HOUR, `último open_time ${latest}`);
  assertCondition(absent === undefined, 'par sem candles deveria devolver undefined');
  const firstOnly = await repository.findCandles({
    ...key,
    from: FIRST_OPEN_TIME,
    to: FIRST_OPEN_TIME + 5 * ONE_HOUR,
    limit: 2,
  });
  assertCondition(
    firstOnly.map((candle) => candle.openTime).join() ===
      [FIRST_OPEN_TIME, FIRST_OPEN_TIME + ONE_HOUR].join(),
    'limit devolve só os primeiros candles do intervalo, em ordem',
  );
  reportCheck(
    'leitura ordenada e semi-aberta [from, to) com teto de linhas; findLatestOpenTime devolve o maior',
  );
}

async function checkRejections(context: CandleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });
  const openCandle = {
    ...buildCandle('REJECTEDUSDT', 0),
    closeTime: NOW_MILLISECONDS + CLOCK_SKEW_TOLERANCE_MILLISECONDS + 1,
  };
  const openRejection = await repository
    .upsertCandles([openCandle])
    .catch((error: unknown) => error);
  assertCondition(openRejection instanceof OpenCandleRejectedError, 'candle aberto aceito');
  assertCondition((await countCandles(client, 'REJECTEDUSDT')) === 0, 'candle aberto foi gravado');
  const inverted = { ...buildCandle('REJECTEDUSDT', 1), high: '1.00000000', low: '2.00000000' };
  const invertedCode = await readRejectionCode(repository.upsertCandles([inverted]));
  assertCondition(invertedCode === CHECK_VIOLATION_SQLSTATE, `high < low -> ${invertedCode}`);
  const backwards = {
    ...buildCandle('REJECTEDUSDT', 2),
    closeTime: FIRST_OPEN_TIME + 2 * ONE_HOUR,
  };
  const backwardsCode = await readRejectionCode(repository.upsertCandles([backwards]));
  assertCondition(backwardsCode === CHECK_VIOLATION_SQLSTATE, `close <= open -> ${backwardsCode}`);
  for (const [label, outsideRange] of [
    ['open acima de high', { open: '3.00000000' }],
    ['open abaixo de low', { open: '0.50000000' }],
    ['close acima de high', { close: '3.00000000' }],
    ['close abaixo de low', { close: '0.50000000' }],
  ] as const) {
    const candle = {
      ...buildCandle('REJECTEDUSDT', 3),
      high: '2.00000000',
      low: '1.00000000',
      open: '1.50000000',
      close: '1.50000000',
      ...outsideRange,
    };
    const outsideCode = await readRejectionCode(repository.upsertCandles([candle]));
    assertCondition(outsideCode === CHECK_VIOLATION_SQLSTATE, `${label} -> ${outsideCode}`);
  }
  const rawTimeframeCode = await readRejectionCode(
    Promise.resolve(client`
      INSERT INTO candles (exchange, symbol, timeframe, open_time, close_time, open, high, low, close, volume, trade_count)
      VALUES ('binance', 'REJECTEDUSDT', '5m', 1, 2, 1, 1, 1, 1, 1, 1)`),
  );
  assertCondition(
    rawTimeframeCode === CHECK_VIOLATION_SQLSTATE,
    `timeframe 5m -> ${rawTimeframeCode}`,
  );
  assertCondition((await countCandles(client, 'REJECTEDUSDT')) === 0, 'rejeitados deixaram linhas');
  reportCheck(
    'candle aberto, high < low, close <= open, open/close fora de [low, high] e timeframe fora da lista -> rejeitados',
  );
}

async function checkBulkInsert(context: CandleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });
  const bulk = Array.from({ length: BULK_CANDLE_COUNT }, (_, hourIndex) =>
    buildCandle('BULKUSDT', hourIndex),
  );
  const result = await repository.upsertCandles(bulk);
  const total = await countCandles(client, 'BULKUSDT');
  assertCondition(result.inserted === BULK_CANDLE_COUNT, `inseridos ${result.inserted}`);
  assertCondition(total === BULK_CANDLE_COUNT, `contagem ${total}`);
  assertCondition((await repository.upsertCandles(bulk)).inserted === 0, 'reenvio inseriu linhas');
  reportCheck(`${BULK_CANDLE_COUNT} candles em lotes de 1000 -> inseridos e reenvio idempotente`);
}

export async function checkCandleRepository(context: CandleCheckContext): Promise<void> {
  await checkIdempotentUpsert(context);
  await checkExactRoundTrip(context);
  await checkRangeAndLatest(context);
  await checkRejections(context);
  await checkBulkInsert(context);
}
