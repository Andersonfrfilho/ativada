// Copyright (c) 2026 Ada Technology. All rights reserved.
// Medição da T0.1 da spec 009 (ADR 0002, "Gráfico estilo Binance (spec 009)", P6): plano de execução e p95 da consulta
// única do resumo de acertos com 17.520 sinais (backtest de 15 min em 6 meses) no meio de 525.600 sinais de outras
// execuções. Uso: DATABASE_URL=<postgres descartável> bun run packages/database/test-support/projection-summary-benchmark.ts
import { applyMigrations } from '../src/migrate.js';
import { closeDatabase, openDatabase } from '../src/database-handle.js';
import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { readDatabaseUrl } from '../src/read-database-url.js';
import { RUN_KIND } from '../src/runs/run.constant.js';
import { resolvePersistenceOwner, seedRun } from './persistence-seed.js';
import { createTemporaryDatabase, dropTemporaryDatabase } from './temporary-database.js';

const FIFTEEN_MINUTES = 900_000;
const RUN_SIGNALS = 17_520;
const BACKGROUND_RUNS = 30;
const CANDLE_COUNT = 70_080;
const FIRST_CANDLE_TIME = 1_735_689_600_000;
const RUN_START = FIRST_CANDLE_TIME + 35_040 * FIFTEEN_MINUTES;
const RUN_END = RUN_START + RUN_SIGNALS * FIFTEEN_MINUTES;
const WARMUP_ROUNDS = 10;
const MEASURED_ROUNDS = 200;

type Variant = { readonly name: string; readonly text: string };

const WINDOWS_CTE = `windows AS (
  SELECT * FROM jsonb_to_recordset($1::text::jsonb) AS w(start_time bigint, end_time bigint, buy numeric, sell numeric)
)`;

const JUDGED_SELECT = `judged AS (
  SELECT sign(score) * sign(next_close - base_close) AS outcome, next_close > base_close AS went_up,
    CASE WHEN abs(score) * 2 <= abs(CASE WHEN score > 0 THEN buy ELSE sell END) THEN 'weak'
         WHEN abs(score) < abs(CASE WHEN score > 0 THEN buy ELSE sell END) THEN 'strong'
         ELSE 'decided' END AS strength,
    CASE WHEN atr IS NULL THEN NULL
         ELSE next_close >= floor((base_close - atr) * 100000000) / 100000000
          AND next_close <= ceil((base_close + atr) * 100000000) / 100000000 END AS is_inside
  FROM resolved
)
SELECT count(*) FILTER (WHERE outcome = 1) AS hits, count(*) FILTER (WHERE outcome = -1) AS misses,
  count(*) FILTER (WHERE outcome = 0) AS ties, count(*) FILTER (WHERE outcome <> 0 AND went_up) AS up_moves,
  count(is_inside) AS banded, count(*) FILTER (WHERE is_inside) AS inside,
  count(*) FILTER (WHERE outcome = 1 AND strength = 'weak') AS weak_hits,
  count(*) FILTER (WHERE outcome = -1 AND strength = 'weak') AS weak_misses,
  count(*) FILTER (WHERE outcome = 1 AND strength = 'strong') AS strong_hits,
  count(*) FILTER (WHERE outcome = -1 AND strength = 'strong') AS strong_misses,
  count(*) FILTER (WHERE outcome = 1 AND strength = 'decided') AS decided_hits,
  count(*) FILTER (WHERE outcome = -1 AND strength = 'decided') AS decided_misses
FROM judged`;

// $1 janelas (jsonb), $2 dono, $3 execução, $4 par, $5 timeframe, $6 duração da vela, $7 fim da faixa da execução.
const EQUALITY_JOIN: Variant = {
  name: 'junção por igualdade na PK (próxima vela = candle_time + d)',
  text: `WITH ${WINDOWS_CTE}, resolved AS (
  SELECT s.score, base.close AS base_close, next.close AS next_close,
    (s.indicators->>'risk:atr')::numeric AS atr, w.buy, w.sell
  FROM windows w
  JOIN signals s ON s.user_id = $2 AND s.run_id = $3
    AND s.candle_time >= w.start_time AND s.candle_time < w.end_time
  JOIN candles base ON base.exchange = 'binance' AND base.symbol = $4 AND base.timeframe = $5
    AND base.open_time = s.candle_time
  JOIN candles next ON next.exchange = 'binance' AND next.symbol = $4 AND next.timeframe = $5
    AND next.open_time = s.candle_time + $6::bigint
  WHERE s.score <> 0 AND s.candle_time + $6::bigint < $7::bigint
), ${JUDGED_SELECT}`,
};

const LEAD_WINDOW: Variant = {
  name: 'LEAD sobre a faixa de velas (próxima vela exigida contígua)',
  text: `WITH ${WINDOWS_CTE}, series AS (
  SELECT open_time, close, lead(open_time) OVER ordered AS next_open, lead(close) OVER ordered AS next_close
  FROM candles
  WHERE exchange = 'binance' AND symbol = $4 AND timeframe = $5
    AND open_time >= (SELECT min(start_time) FROM windows) AND open_time < $7::bigint
  WINDOW ordered AS (ORDER BY open_time)
), resolved AS (
  SELECT s.score, series.close AS base_close, series.next_close,
    (s.indicators->>'risk:atr')::numeric AS atr, w.buy, w.sell
  FROM windows w
  JOIN signals s ON s.user_id = $2 AND s.run_id = $3
    AND s.candle_time >= w.start_time AND s.candle_time < w.end_time
  JOIN series ON series.open_time = s.candle_time AND series.next_open = s.candle_time + $6::bigint
  WHERE s.score <> 0
), ${JUDGED_SELECT}`,
};

// Uma página de `strategy-layers` (1.000 velas): $1 dono, $2 execução, $3 de, $4 até.
const LAYERS_PAGE: Variant = {
  name: 'página de camadas (1.000 velas de signals)',
  text: `SELECT candle_time, score, action, indicators FROM signals
  WHERE user_id = $1 AND run_id = $2 AND candle_time >= $3::bigint AND candle_time < $4::bigint
  ORDER BY candle_time LIMIT 1001`,
};

async function seedCandles(client: Bun.SQL): Promise<void> {
  for (const symbol of ['BTCUSDT', 'ETHUSDT']) {
    await client.unsafe(
      `INSERT INTO candles (exchange, symbol, timeframe, open_time, close_time, open, high, low, close, volume, trade_count)
       SELECT 'binance', $1, '15m', $2::bigint + i::bigint * 900000, $2::bigint + i::bigint * 900000 + 899999,
         p, greatest(p, c) + 3, least(p, c) - 3, c, 100 + (i % 37), 1000
       FROM generate_series(0, $3::int - 1) AS i,
         LATERAL (SELECT round((30000 + 2000 * sin(i / 500.0) + (i % 13))::numeric, 2) AS p) AS opening,
         LATERAL (SELECT p + ((i * 37) % 11 - 5) AS c) AS closing`,
      [symbol, FIRST_CANDLE_TIME, CANDLE_COUNT],
    );
  }
}

async function seedSignals(
  client: Bun.SQL,
  params: { readonly userId: string; readonly runId: string },
): Promise<void> {
  await client.unsafe(
    `INSERT INTO signals (id, user_id, run_id, candle_time, action, score, regime, votes, indicators, reason)
     SELECT gen_random_uuid(), $1, $2, $3::bigint + i::bigint * 900000,
       CASE WHEN i % 17 = 0 THEN 'BUY' WHEN i % 19 = 0 THEN 'SELL' ELSE 'HOLD' END,
       ((i % 9) - 4)::numeric * 0.5, 'trending',
       '[{"ruleId":"ema-9-21","family":"trend","vote":1,"weight":"1.5","isMissing":false},{"ruleId":"macd-12-26-9","family":"trend","vote":-1,"weight":"1.5","isMissing":false},{"ruleId":"rsi-14","family":"reversion","vote":0,"weight":"0.5","isMissing":false},{"ruleId":"obv-ema-20","family":"volume","vote":1,"weight":"1","isMissing":false}]'::jsonb,
       jsonb_build_object('rule:ema-9-21.fast', 30000.123456 + i, 'rule:ema-9-21.slow', 30010.654321 + i,
         'rule:macd-12-26-9.histogram', 1.2345678, 'rule:macd-12-26-9.macd', 12.345678, 'rule:macd-12-26-9.signal', 11.111111,
         'rule:rsi-14', 51.23456789, 'rule:obv-ema-20.obv', 123456.789, 'rule:obv-ema-20.average', 123000.5,
         'regime:adx.adx', 27.5, 'regime:adx.plusDi', 22.1, 'regime:adx.minusDi', 18.9, 'risk:atr', 120.5 + (i % 50)),
       'O placar ficou em 1 de 2: esperou.'
     FROM generate_series(0, $4::int - 1) AS i`,
    [params.userId, params.runId, RUN_START, RUN_SIGNALS],
  );
}

function percentile(sorted: readonly number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? Number.NaN;
}

async function measure(
  client: Bun.SQL,
  variant: Variant,
  values: readonly unknown[],
): Promise<void> {
  const plan: unknown = await client.unsafe(`EXPLAIN (ANALYZE, BUFFERS) ${variant.text}`, [
    ...values,
  ]);
  const rows: readonly unknown[] = Array.isArray(plan) ? plan : [];
  const lines = rows.map((row) =>
    typeof row === 'object' && row !== null ? String(Object.values(row)[0]) : '',
  );
  for (let round = 0; round < WARMUP_ROUNDS; round += 1)
    await client.unsafe(variant.text, [...values]);
  const timings: number[] = [];
  let result: unknown;
  for (let round = 0; round < MEASURED_ROUNDS; round += 1) {
    const started = performance.now();
    result = await client.unsafe(variant.text, [...values]);
    timings.push(performance.now() - started);
  }
  timings.sort((left, right) => left - right);
  process.stdout.write(`\n=== ${variant.name}\n${lines.join('\n')}\n`);
  const resultText = JSON.stringify(result);
  process.stdout.write(
    resultText.length > 600
      ? `resultado: ${resultText.length} bytes em JSON (linhas cruas)\n`
      : `resultado: ${resultText}\n`,
  );
  process.stdout.write(
    `rodadas ${MEASURED_ROUNDS}: p50 ${percentile(timings, 0.5).toFixed(1)} ms, p95 ${percentile(timings, 0.95).toFixed(1)} ms, máx ${(timings.at(-1) ?? 0).toFixed(1)} ms\n`,
  );
}

async function seedOwnerRun(
  handle: ReturnType<typeof openDatabase>,
  subject: string,
): Promise<{ userId: string; runId: string }> {
  const owner = await resolvePersistenceOwner(handle, subject);
  const run = await seedRun(handle, owner, {
    kind: RUN_KIND.BACKTEST,
    symbol: 'BTCUSDT',
    timeframe: '15m',
    periodStart: RUN_START,
    periodEnd: RUN_END,
  });
  return { userId: owner.userId, runId: run.id };
}

async function runBenchmark(databaseUrl: string): Promise<void> {
  await applyMigrations({ databaseUrl, migrationsFolder: MIGRATIONS_FOLDER });
  const handle = openDatabase(databaseUrl);
  const client = new Bun.SQL(databaseUrl);
  try {
    await seedCandles(client);
    for (let index = 0; index < BACKGROUND_RUNS; index += 1) {
      await seedSignals(client, await seedOwnerRun(handle, `benchmark-background-${index % 5}`));
    }
    const target = await seedOwnerRun(handle, 'benchmark-target');
    await seedSignals(client, target);
    await client.unsafe('ANALYZE');
    const counts: unknown = await client.unsafe(
      'SELECT (SELECT count(*) FROM signals) AS signals, (SELECT count(*) FROM candles) AS candles',
    );
    process.stdout.write(`volume: ${JSON.stringify(counts)}\n`);
    const single = [
      { start_time: RUN_START - FIFTEEN_MINUTES, end_time: RUN_END, buy: '2', sell: '-2' },
    ];
    const sixWindows = Array.from({ length: 6 }, (_unused, index) => ({
      start_time: RUN_START + index * 2_920 * FIFTEEN_MINUTES,
      end_time: RUN_START + (index + 1) * 2_920 * FIFTEEN_MINUTES,
      buy: index % 2 === 0 ? '2' : '1.5',
      sell: index % 2 === 0 ? '-2' : '-1.5',
    }));
    for (const windows of [single, sixWindows]) {
      process.stdout.write(`\n##### ${windows.length} janela(s)\n`);
      const values = [
        JSON.stringify(windows),
        target.userId,
        target.runId,
        'BTCUSDT',
        '15m',
        FIFTEEN_MINUTES,
        RUN_END,
      ];
      await measure(client, EQUALITY_JOIN, values);
      await measure(client, LEAD_WINDOW, values);
    }
    process.stdout.write('\n##### camadas\n');
    const pageStart = RUN_END - 1_000 * FIFTEEN_MINUTES;
    await measure(client, LAYERS_PAGE, [target.userId, target.runId, pageStart, RUN_END]);
  } finally {
    await client.close();
    await closeDatabase(handle);
  }
}

const adminUrl = readDatabaseUrl();
const temporary = await createTemporaryDatabase(adminUrl, 'ativada_projection_benchmark_');
try {
  await runBenchmark(temporary.url);
} finally {
  await dropTemporaryDatabase(adminUrl, temporary.databaseName);
}
