// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createCandleRepository } from '../src/candles/candle.repository.js';
import type { CandleRecord, StoredCandleTimeframe } from '../src/candles/candle.types.js';
import { readPostgresErrorCode } from '../src/postgres-error-code.js';
import type { CandleCheckContext } from './candle-checks.js';

const NOW_MILLISECONDS = 1_800_000_000_000;
const THREE_MINUTES = 180_000;
const FIFTEEN_MINUTES = 900_000;
const ONE_DAY = 86_400_000;
const SYMBOL = 'DISPUSDT';
const CHECK_VIOLATION_SQLSTATE = '23514';
// Grade de 15 min: toda fronteira dela é fronteira de 3 min.
const CUTOFF = 1_700_000_100_000 - (1_700_000_100_000 % FIFTEEN_MINUTES);
const SCALE_8 = 100_000_000n;
const KEY = { exchange: 'binance', symbol: SYMBOL } as const;

type Row = CandleRecord<StoredCandleTimeframe>;

function candle(timeframe: StoredCandleTimeframe, openTime: number, tradeCount = 1): Row {
  const duration = timeframe === '3m' ? THREE_MINUTES : FIFTEEN_MINUTES;
  return {
    ...KEY,
    timeframe,
    openTime,
    closeTime: openTime + duration - 1,
    open: '1.00000000',
    high: '2.00000000',
    low: '1.00000000',
    close: '2.00000000',
    volume: '1.00000000',
    tradeCount,
  };
}

// Independente do código de produção: decimal em texto vira inteiro de escala 8.
function toScaled(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * SCALE_8 + BigInt(fraction.padEnd(8, '0').slice(0, 8));
}

async function countRows(client: Bun.SQL, timeframe: string): Promise<number> {
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM candles WHERE symbol = ${SYMBOL} AND timeframe = ${timeframe}`;
  return (rows as readonly { readonly total: number }[])[0]?.total ?? 0;
}

async function checkPurgeOnlyDisplayCandles(context: CandleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });
  const displayRows = [
    ...Array.from({ length: 7 }, (_unused, index) =>
      candle('3m', CUTOFF - (index + 1) * THREE_MINUTES),
    ),
    candle('3m', CUTOFF),
    candle('3m', CUTOFF + THREE_MINUTES),
  ];
  const executionRows = (['15m', '1h', '4h', '1d'] as const).map((timeframe, index) =>
    candle(timeframe, CUTOFF - (index + 1) * ONE_DAY),
  );
  await repository.upsertCandles([...displayRows, ...executionRows]);
  const first = await repository.purgeDisplayCandles({ openedBefore: CUTOFF, batchSize: 3 });
  assertCondition(first === 7, `o expurgo em lotes de 3 apagou ${first} (esperado 7)`);
  assertCondition(
    (await countRows(client, '3m')) === 2,
    'sobraram velas 3m: a do corte (exclusivo) e a mais nova',
  );
  for (const timeframe of ['15m', '1h', '4h', '1d']) {
    assertCondition((await countRows(client, timeframe)) === 1, `o expurgo tocou em ${timeframe}`);
  }
  const second = await repository.purgeDisplayCandles({ openedBefore: CUTOFF });
  assertCondition(second === 0, 'o segundo expurgo apagou algo');
  reportCheck('expurgo: só 3m anterior ao corte (exclusivo), em lotes; 15m, 1h, 4h e 1d intactos');
}

async function checkSeriesStayApart(context: CandleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });
  const sameOpen = CUTOFF + 10 * FIFTEEN_MINUTES;
  await repository.upsertCandles([candle('3m', sameOpen), candle('15m', sameOpen)]);
  const range = { from: sameOpen, to: sameOpen + FIFTEEN_MINUTES };
  const fifteen = await repository.findCandles({ ...KEY, timeframe: '15m', ...range });
  const three = await repository.findCandles({ ...KEY, timeframe: '3m', ...range });
  assertCondition(
    fifteen.length === 1 && fifteen[0]?.timeframe === '15m',
    'a leitura de 15m trouxe 3m',
  );
  assertCondition(three.length === 1 && three[0]?.timeframe === '3m', 'a leitura de 3m trouxe 15m');
  const latest = await repository.findLatestOpenTime({ ...KEY, timeframe: '15m' });
  assertCondition(latest !== undefined && latest >= sameOpen, 'última vela de 15m não achada');
  reportCheck('mesma abertura em 3m e 15m: cada leitura traz só a própria vela');
}

async function checkCheckConstraint(context: CandleCheckContext): Promise<void> {
  const { client, assertCondition, reportCheck } = context;
  const code = await client
    .unsafe(
      `INSERT INTO candles (exchange, symbol, timeframe, open_time, close_time, open, high, low, close, volume, trade_count)
       VALUES ('binance', '${SYMBOL}', '5m', 0, 299999, 1, 2, 1, 2, 1, 1)`,
    )
    .then(
      () => undefined,
      (error: unknown) => readPostgresErrorCode(error),
    );
  assertCondition(code === CHECK_VIOLATION_SQLSTATE, `5m não deveria ser aceita (código ${code})`);
  reportCheck('CHECK: 3m aceita, 5m (não autorizada) recusada');
}

function buildFiveThreeMinuteCandles(origin: number): readonly Row[] {
  const opens = ['10.00000000', '10.20000000', '10.30000000', '10.40000000', '10.30000000'];
  const highs = ['10.50000000', '12.25000000', '11.00000000', '10.60000000', '10.50000000'];
  const lows = ['9.50000000', '10.00000000', '9.25000000', '8.75000000', '9.90000000'];
  const closes = ['10.20000000', '10.30000000', '10.40000000', '10.30000000', '10.05000000'];
  const volumes = ['1.10000000', '2.20000000', '3.30000000', '4.40000000', '5.50000000'];
  return opens.map((open, index) => ({
    ...candle('3m', origin + index * THREE_MINUTES, 10 + index),
    open,
    high: highs[index] ?? '0',
    low: lows[index] ?? '0',
    close: closes[index] ?? '0',
    volume: volumes[index] ?? '0',
  }));
}

function sumScaled(values: readonly string[]): bigint {
  return values.reduce((sum, value) => sum + toScaled(value), 0n);
}

function extremeScaled(values: readonly string[], pick: 'max' | 'min'): bigint {
  const scaled = values.map(toScaled);
  return scaled.reduce((best, value) => {
    const isBetter = pick === 'max' ? value > best : value < best;
    return isBetter ? value : best;
  });
}

async function checkFiveThreeMinuteCandlesMakeTheFifteen(
  context: CandleCheckContext,
): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const repository = createCandleRepository(handle, { now: () => NOW_MILLISECONDS });
  const origin = CUTOFF + 20 * FIFTEEN_MINUTES;
  const fifteen: Row = {
    ...candle('15m', origin, 60),
    open: '10.00000000',
    high: '12.25000000',
    low: '8.75000000',
    close: '10.05000000',
    volume: '16.50000000',
  };
  await repository.upsertCandles([...buildFiveThreeMinuteCandles(origin), fifteen]);
  const range = { from: origin, to: origin + FIFTEEN_MINUTES };
  const read = await repository.findCandles({ ...KEY, timeframe: '3m', ...range });
  const [stored] = await repository.findCandles({ ...KEY, timeframe: '15m', ...range });
  const first = read[0];
  const last = read[4];
  if (read.length !== 5 || stored === undefined || first === undefined || last === undefined) {
    throw new Error('faltam velas na janela de 15 min');
  }
  const fields = {
    open: toScaled(first.open) === toScaled(stored.open),
    close: toScaled(last.close) === toScaled(stored.close),
    high:
      extremeScaled(
        read.map((row) => row.high),
        'max',
      ) === toScaled(stored.high),
    low:
      extremeScaled(
        read.map((row) => row.low),
        'min',
      ) === toScaled(stored.low),
    volume: sumScaled(read.map((row) => row.volume)) === toScaled(stored.volume),
    tradeCount: read.reduce((sum, row) => sum + row.tradeCount, 0) === stored.tradeCount,
  };
  const diverging = Object.entries(fields).filter(([, isEqual]) => !isEqual);
  assertCondition(
    diverging.length === 0,
    `5x3 diverge de 15 em: ${diverging.map(([name]) => name).join(', ')}`,
  );
  reportCheck(
    '5 velas de 3 min (bigint, escala 8) = a vela de 15 min gravada: OHLCV e trade_count',
  );
}

export async function checkDisplayCandles(context: CandleCheckContext): Promise<void> {
  await checkPurgeOnlyDisplayCandles(context);
  await checkSeriesStayApart(context);
  await checkCheckConstraint(context);
  await checkFiveThreeMinuteCandlesMakeTheFifteen(context);
}
