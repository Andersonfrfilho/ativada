// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOLDEN_DATASETS } from '../../test/fixtures/strategy-engine/production/engine-golden.fixture.js';
import type { RealDataset } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { canonicalJson } from '../../packages/strategy-engine/src/index.js';
import {
  createBacktestRun,
  createTestRunner,
  seedCandles as seedBacktestCandles,
} from '../backtest-test/backtest-test-context.js';
import { readPersistedRun, type PersistedRun } from '../backtest-test/read-run-rows.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createProductionEvaluator,
  digestOf,
  errorsOf,
  LEAD_IN_CANDLES,
  reportLine,
  tickUntilQuiet,
  type LiveTestContext,
} from './live-test-context.js';

// Várias rondas por simulação (64 passos cada): a leitura de candles a partir do último gravado é exercitada de verdade.
const PARITY_PASS_STEPS = 64;

function periodOf(dataset: RealDataset): { periodStart: number; periodEnd: number } {
  const first = dataset.candles[LEAD_IN_CANDLES];
  const last = dataset.candles.at(-1);
  if (first === undefined || last === undefined) throw new Error('conjunto real curto demais');
  return { periodStart: first.openTime, periodEnd: last.closeTime + 1 };
}

function describeCounts(persisted: PersistedRun): string {
  const { counts } = persisted;
  return `${counts['signals']} sinais, ${counts['orders']} ordens, ${counts['fills']} preenchimentos, ${counts['positions']} posições, ${counts['equityPoints']} pontos de patrimônio`;
}

function canonical(value: unknown): string {
  return canonicalJson(JSON.parse(JSON.stringify(value)));
}

// As linhas na ordem do banco, uma a uma: o mesmo id, preço, quantidade, motivo e patrimônio em cada posição.
function expectSameOperations(label: string, live: PersistedRun, backtest: PersistedRun): void {
  const kinds = Object.keys(backtest.rows) as (keyof PersistedRun['rows'])[];
  for (const kind of kinds) {
    const fromBacktest: unknown = backtest.rows[kind];
    const fromLive: unknown = live.rows[kind];
    if (!Array.isArray(fromBacktest) || !Array.isArray(fromLive)) {
      assertCondition(canonical(fromLive) === canonical(fromBacktest), `${label}: ${kind} difere`);
      continue;
    }
    assertCondition(
      fromLive.length === fromBacktest.length,
      `${label}: ${kind} tem ${fromLive.length} no ao vivo e ${fromBacktest.length} no backtest`,
    );
    fromBacktest.forEach((row: unknown, index) => {
      assertCondition(
        canonical(row) === canonical(fromLive[index]),
        `${label}: ${kind} #${index} difere entre o ao vivo e o backtest`,
      );
    });
  }
}

async function checkDataset(context: LiveTestContext, dataset: RealDataset): Promise<void> {
  const { symbol, timeframe } = dataset.market;
  if (timeframe !== '1h' && timeframe !== '1d') throw new Error('timeframe fora do conjunto');
  await seedBacktestCandles(context.backtest, dataset.candles);
  const window = periodOf(dataset);
  const backtestRun = await createBacktestRun(context.backtest, { symbol, timeframe, ...window });
  const outcome = await createTestRunner(context.backtest).run(backtestRun.id);
  assertCondition(
    outcome.status === 'completed',
    `${dataset.name}: backtest terminou ${outcome.status}`,
  );
  const liveRun = await createLiveRun(context, {
    symbol,
    timeframe,
    periodStart: window.periodStart,
  });
  const { evaluator, entries } = createProductionEvaluator(context, {
    instanceId: 'parity-evaluator',
    maxStepsPerPass: PARITY_PASS_STEPS,
  });
  const startedAt = Date.now();
  const totals = await tickUntilQuiet(evaluator);
  const elapsed = Date.now() - startedAt;
  assertCondition(errorsOf(entries).length === 0, `${dataset.name}: o avaliador registrou erro`);
  assertCondition(
    totals.steps === dataset.candles.length,
    `${dataset.name}: ${totals.steps} passos`,
  );
  const backtest = await readPersistedRun(context.backtest, backtestRun.id);
  const live = await readPersistedRun(context.backtest, liveRun.id);
  expectSameOperations(dataset.name, live, backtest);
  const same = digestOf(live.rows) === digestOf(backtest.rows);
  assertCondition(same, `${dataset.name}: o digest das linhas difere`);
  assertCondition(
    canonicalJson(JSON.parse(JSON.stringify(live.engineState))) ===
      canonicalJson(JSON.parse(JSON.stringify(backtest.engineState))),
    `${dataset.name}: o estado do motor no último candle difere`,
  );
  assertCondition(
    live.lastCandleTime === backtest.lastCandleTime,
    `${dataset.name}: último candle`,
  );
  context.references.set(dataset.name, {
    rowsDigest: digestOf(live.rows),
    engineStateJson: canonicalJson(JSON.parse(JSON.stringify(live.engineState))),
    lastCandleTime: live.lastCandleTime ?? 0,
    counts: live.counts,
  });
  await cancelRun(context, { runId: liveRun.id });
  reportLine(
    `T4.2 ${dataset.name}: ${describeCounts(live)} - IDÊNTICOS ao backtest, linha a linha (ids, preços, quantidades, motivos, patrimônio); digest ${digestOf(live.rows).slice(0, 16)}, estado do motor e último candle iguais; ${totals.steps} passos (uma transação cada) em ${elapsed} ms (${Math.round(elapsed / totals.steps)} ms por passo, incluindo duas rondas ociosas)`,
  );
}

// T4.2 contra o Postgres: o MESMO conjunto de candles reais, como backtest (thread de produção) e como simulação ao vivo
// passo a passo (uma transação por candle), deixa as mesmas operações, uma a uma.
export async function checkParity(context: LiveTestContext): Promise<void> {
  for (const dataset of GOLDEN_DATASETS) await checkDataset(context, dataset);
}
