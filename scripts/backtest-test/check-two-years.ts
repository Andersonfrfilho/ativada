// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  canonicalJson,
  computeStrategyLeadInCandles,
  createStrategyVersion,
} from '../../packages/strategy-engine/src/index.js';
import {
  buildTwoYearSyntheticSeries,
  TWO_YEARS_OF_HOURLY_CANDLES,
} from '../../test/fixtures/backtest/synthetic-candles.fixture.js';
import { loadClassicScoreboard } from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  DAY_MILLISECONDS,
  FIVE_SECONDS_MILLISECONDS,
  HOUR_MILLISECONDS,
} from './backtest-test.constant.js';
import {
  assertCondition,
  createBacktestRun,
  createTestRunner,
  reportLine,
  seedCandles,
  seedSentiment,
  type BacktestTestContext,
} from './backtest-test-context.js';
import { runDirectly, sameCanonicalJson } from './direct-run.js';
import { readPersistedRun, type PersistedRun } from './read-run-rows.js';

export const SYMBOL = 'BTCUSDT';
export const TIMEFRAME = '1h';
const TIME_STAMP_WIDTH = 8;

export type SyntheticWindow = { readonly periodStart: number; readonly periodEnd: number };

export async function seedTwoYears(context: BacktestTestContext): Promise<SyntheticWindow> {
  const candles = buildTwoYearSyntheticSeries();
  await seedCandles(context, candles);
  const first = candles[0];
  const last = candles.at(-1);
  if (first === undefined || last === undefined) throw new Error('série sintética vazia');
  const leadIn = computeStrategyLeadInCandles(
    createStrategyVersion(loadClassicScoreboard()).config,
  );
  const firstDay =
    Math.floor(first.openTime / DAY_MILLISECONDS) * DAY_MILLISECONDS - 2 * DAY_MILLISECONDS;
  await seedSentiment(context, { firstDay, days: 740 });
  return {
    periodStart: first.openTime + leadIn * HOUR_MILLISECONDS,
    periodEnd: last.closeTime + 1,
  };
}

export type TwoYearResult = {
  readonly runId: string;
  readonly persisted: PersistedRun;
  readonly wallMilliseconds: number;
};

function fixed(value: number): string {
  return value.toFixed(0).padStart(TIME_STAMP_WIDTH);
}

async function runAndMeasure(
  context: BacktestTestContext,
  window: SyntheticWindow,
): Promise<TwoYearResult> {
  const run = await createBacktestRun(context, { symbol: SYMBOL, timeframe: TIMEFRAME, ...window });
  const runner = createTestRunner(context);
  const startedAt = performance.now();
  const outcome = await runner.run(run.id);
  const wallMilliseconds = performance.now() - startedAt;
  assertCondition(outcome.status === 'completed', `backtest de 2 anos terminou ${outcome.status}`);
  if (outcome.status !== 'completed') throw new Error('inalcançável');
  const phases = outcome.phases;
  const accounted =
    outcome.startMilliseconds + phases.load + phases.engine + phases.write + phases.metrics;
  reportLine(
    `RNF01 ${TWO_YEARS_OF_HOURLY_CANDLES} candles 1h de ponta a ponta: ${fixed(wallMilliseconds)} ms ` +
      `(partida da thread ${fixed(outcome.startMilliseconds)}, carga ${fixed(phases.load)}, motor ${fixed(phases.engine)}, ` +
      `gravação ${fixed(phases.write)}, métricas ${fixed(phases.metrics)}, resto ${fixed(wallMilliseconds - accounted)}; ` +
      `${outcome.processedCandles} candles em ${outcome.batches} lotes, ${outcome.gapCandles} lacunas)`,
  );
  return { runId: run.id, persisted: await readPersistedRun(context, run.id), wallMilliseconds };
}

export async function checkTwoYears(
  context: BacktestTestContext,
  window: SyntheticWindow,
): Promise<TwoYearResult> {
  const first = await runAndMeasure(context, window);
  assertCondition(
    first.wallMilliseconds < FIVE_SECONDS_MILLISECONDS,
    `RNF01: ${first.wallMilliseconds.toFixed(0)} ms não é menos de ${FIVE_SECONDS_MILLISECONDS} ms`,
  );
  assertCondition(
    first.persisted.status === 'completed' && first.persisted.progress === 100,
    'run não completou com 100%',
  );
  reportLine(
    `RNF01: ${first.wallMilliseconds.toFixed(0)} ms < ${FIVE_SECONDS_MILLISECONDS} ms; ` +
      `${JSON.stringify(first.persisted.counts)}`,
  );
  const second = await runAndMeasure(context, window);
  assertCondition(
    first.persisted.digest === second.persisted.digest,
    'DETERMINISMO: duas execuções deram resultados diferentes',
  );
  assertCondition(
    canonicalJson(JSON.parse(JSON.stringify(first.persisted.rows))) ===
      canonicalJson(JSON.parse(JSON.stringify(second.persisted.rows))),
    'DETERMINISMO: as linhas divergem',
  );
  reportLine(
    `DETERMINISMO: duas execuções, digest ${first.persisted.digest} (sinais, ordens, preenchimentos, posições, patrimônio, métricas e estado do motor)`,
  );
  await checkParityWithDirectRun(context, window, first);
  return first;
}

export async function checkParityWithDirectRun(
  context: BacktestTestContext,
  window: SyntheticWindow,
  result: TwoYearResult,
): Promise<void> {
  const direct = await runDirectly(context, { symbol: SYMBOL, timeframe: TIMEFRAME, ...window });
  const { rows } = result.persisted;
  assertCondition(
    sameCanonicalJson(rows.equityPoints, direct.expected.equityPoints),
    'PARIDADE: patrimônio difere do motor direto',
  );
  assertCondition(
    sameCanonicalJson(rows.signals, direct.expected.signals),
    'PARIDADE: sinais diferem do motor direto',
  );
  assertCondition(
    sameCanonicalJson(rows.fills, direct.expected.fills),
    'PARIDADE: preenchimentos diferem do motor direto',
  );
  assertCondition(
    sameCanonicalJson(rows.closedPositions, direct.expected.closedPositions),
    'PARIDADE: posições diferem do motor direto',
  );
  assertCondition(
    sameCanonicalJson(rows.orderStatuses, direct.expected.orderStatuses),
    'PARIDADE: ordens diferem do motor direto',
  );
  assertCondition(
    sameCanonicalJson(result.persisted.metrics, direct.metrics),
    'PARIDADE: métricas diferem do motor direto',
  );
  assertCondition(
    canonicalJson(JSON.parse(JSON.stringify(result.persisted.engineState))) ===
      direct.finalStateJson,
    'PARIDADE: o estado final do motor difere do motor direto',
  );
  reportLine(
    `PARIDADE: o gravado é idêntico ao do mesmo motor direto em memória (${rows.equityPoints.length} pontos, ${rows.signals.length} sinais, ${rows.fills.length} preenchimentos, ${rows.closedPositions.length} operações, métricas e estado final)`,
  );
}
