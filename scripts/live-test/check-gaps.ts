// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createEngine, type EngineCandle } from '../../packages/strategy-engine/src/index.js';
import { buildClassicScenario } from '../../test/fixtures/strategy-engine/production/engine-golden.fixture.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
  type RealDataset,
} from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  createBacktestRun,
  createTestRunner,
  seedCandles as seedBacktestCandles,
} from '../backtest-test/backtest-test-context.js';
import { readPersistedRun } from '../backtest-test/read-run-rows.js';
import { HOUR_MILLISECONDS } from './live-test.constant.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createProductionEvaluator,
  digestOf,
  errorsOf,
  LEAD_IN_CANDLES,
  readProgress,
  reportLine,
  seedCandles,
  tickUntilQuiet,
  type LiveTestContext,
} from './live-test-context.js';

const HOLE_AT = 300;
const HOLE_SIZE = 3;

function requireDataset(): RealDataset {
  const dataset = REAL_DATASETS[0];
  if (dataset === undefined) throw new Error('sem conjunto real');
  return dataset;
}

function firstIndexWithOpenPosition(dataset: RealDataset): number {
  const engine = createEngine();
  const setup = buildClassicScenario(dataset).run;
  let state = engine.createInitialState({ strategy: CLASSIC_STRATEGY, run: setup });
  let previous: number | null = null;
  for (const [index, candle] of dataset.candles.entries()) {
    const gap = previous === null ? 0 : (candle.openTime - previous) / HOUR_MILLISECONDS - 1;
    state = engine.step({
      strategy: CLASSIC_STRATEGY,
      run: setup,
      state,
      candle,
      confirmedGapCandles: gap > 0 ? gap : undefined,
    }).state;
    previous = candle.openTime;
    if (state.wallet.position !== null) return index;
  }
  throw new Error('o conjunto real não abre posição');
}

function withHole(candles: readonly EngineCandle[], at: number): EngineCandle[] {
  return candles.filter((_candle, index) => index < at || index >= at + HOLE_SIZE);
}

async function checkHoleThatMayBeRecovered(context: LiveTestContext): Promise<void> {
  const dataset = requireDataset();
  const reference = context.references.get(dataset.name);
  const first = dataset.candles[LEAD_IN_CANDLES];
  if (reference === undefined || first === undefined) throw new Error('sem a referência');
  const symbol = 'SOLUSDT';
  await seedCandles(context, withHole(dataset.candles, HOLE_AT), { symbol });
  const run = await createLiveRun(context, {
    symbol,
    timeframe: '1h',
    periodStart: first.openTime,
  });
  const { evaluator, entries } = createProductionEvaluator(context, { instanceId: 'gaps-waiting' });
  await tickUntilQuiet(evaluator);
  const waiting = await readProgress(context, run.id);
  const beforeHole = dataset.candles[HOLE_AT - 1]?.openTime;
  assertCondition(
    waiting.lastCandleTime === beforeHole,
    `devia esperar no candle antes do buraco (${waiting.lastCandleTime} em vez de ${beforeHole})`,
  );
  assertCondition(
    waiting.status === 'running' && waiting.errorCode === null,
    'esperar não é falhar',
  );
  await seedCandles(context, dataset.candles.slice(HOLE_AT, HOLE_AT + HOLE_SIZE), { symbol });
  await tickUntilQuiet(evaluator);
  const persisted = await readPersistedRun(context.backtest, run.id);
  assertCondition(
    digestOf(persisted.rows) === reference.rowsDigest,
    'preenchido, o resultado difere do contínuo',
  );
  assertCondition(errorsOf(entries).length === 0, 'erro registrado');
  await cancelRun(context, { runId: run.id });
  reportLine(
    `buraco de ${HOLE_SIZE} candles ainda recuperável: a simulação espera no candle ${HOLE_AT - 1} sem falhar; preenchido, segue e termina IDÊNTICA à contínua (digest ${digestOf(persisted.rows).slice(0, 16)})`,
  );
}

async function checkConfirmedGap(context: LiveTestContext): Promise<void> {
  const dataset = requireDataset();
  const first = dataset.candles[LEAD_IN_CANDLES];
  const holeAt = firstIndexWithOpenPosition(dataset) + 1;
  if (first === undefined) throw new Error('sem conjunto real');
  const symbol = 'ADAUSDT';
  const holey = withHole(dataset.candles, holeAt);
  await seedCandles(context, holey, { symbol });
  const run = await createLiveRun(context, {
    symbol,
    timeframe: '1h',
    periodStart: first.openTime,
  });
  const { evaluator, entries } = createProductionEvaluator(context, {
    instanceId: 'gaps-confirmed',
    isGapConfirmed: ({ openTimes }) => openTimes.length === HOLE_SIZE,
  });
  await tickUntilQuiet(evaluator);
  const last = holey.at(-1);
  assertCondition(
    (await readProgress(context, run.id)).lastCandleTime === last?.openTime,
    'não alcançou o fim',
  );
  const live = await readPersistedRun(context.backtest, run.id);
  const exits: unknown = await context.client.unsafe(
    "SELECT count(*)::int AS total FROM positions WHERE run_id = $1 AND exit_reason = 'gap'",
    [run.id],
  );
  const gapExits = (exits as readonly { total: number }[])[0]?.total ?? 0;
  assertCondition(gapExits >= 1, 'nenhuma posição fechada com motivo gap');
  await seedBacktestCandles(
    context.backtest,
    holey.map((candle) => ({ ...candle, symbol })),
  );
  const backtestRun = await createBacktestRun(context.backtest, {
    symbol,
    timeframe: '1h',
    periodStart: first.openTime,
    periodEnd: (last?.closeTime ?? 0) + 1,
  });
  const outcome = await createTestRunner(context.backtest).run(backtestRun.id);
  assertCondition(outcome.status === 'completed', 'backtest com buraco não terminou');
  const backtest = await readPersistedRun(context.backtest, backtestRun.id);
  assertCondition(
    digestOf(live.rows) === digestOf(backtest.rows),
    'com lacuna, o ao vivo difere do backtest',
  );
  assertCondition(errorsOf(entries).length === 0, 'erro registrado');
  await cancelRun(context, { runId: run.id });
  reportLine(
    `lacuna confirmada (${HOLE_SIZE} candles logo depois de abrir posição): ${gapExits} posição(ões) fechada(s) com motivo gap e o resultado é IDÊNTICO ao do backtest sobre os mesmos candles (digest ${digestOf(live.rows).slice(0, 16)})`,
  );
}

// Candle que ainda pode chegar espera (nunca vira lacuna); lacuna que a recuperação já confirmou fecha a posição com o
// motivo `gap` (ADR 0002 §a), igual ao backtest.
export async function checkGaps(context: LiveTestContext): Promise<void> {
  await checkHoleThatMayBeRecovered(context);
  await checkConfirmedGap(context);
}
