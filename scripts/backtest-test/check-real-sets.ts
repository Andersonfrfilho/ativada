// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ENGINE_VERSION,
  EngineDecimal,
  METRICS_VERSION,
  type RunMetrics,
} from '../../packages/strategy-engine/src/index.js';
import { GOLDEN_METRICS_PATH } from '../../test/fixtures/strategy-engine/metrics/metrics-golden.fixture.js';
import { GOLDEN_DATASETS } from '../../test/fixtures/strategy-engine/production/engine-golden.fixture.js';
import type { RealDataset } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { LEAD_IN_CANDLES } from '../../test/fixtures/backtest/backtest-scenarios.fixture.js';
import {
  assertCondition,
  createBacktestRun,
  createTestRunner,
  reportLine,
  seedCandles,
  type BacktestTestContext,
} from './backtest-test-context.js';
import { runDirectly, sameCanonicalJson } from './direct-run.js';
import { readPersistedRun } from './read-run-rows.js';

const ENGINE_GOLDEN_PATH = `${new URL('../../test/fixtures/strategy-engine/golden/', import.meta.url).pathname}classic-scoreboard-engine.${ENGINE_VERSION}.json`;
const ENGINE_GOLDEN_PLACES = 8;

type MetricsGolden = { readonly datasets: Readonly<Record<string, RunMetrics>> };
type EngineGoldenEntry = {
  readonly operations: number;
  readonly wins: number;
  readonly feesPaid: string;
  readonly finalEquity: string;
  readonly maxDrawdownAtClose: string;
  readonly maxDrawdownAtLow: string;
  readonly buyAndHoldReturn: string;
};

export async function seedRealSets(context: BacktestTestContext): Promise<void> {
  for (const dataset of GOLDEN_DATASETS) await seedCandles(context, dataset.candles);
}

function windowOf(dataset: RealDataset): { periodStart: number; periodEnd: number } {
  const first = dataset.candles[LEAD_IN_CANDLES];
  const last = dataset.candles.at(-1);
  if (first === undefined || last === undefined) throw new Error('conjunto real curto demais');
  return { periodStart: first.openTime, periodEnd: last.closeTime + 1 };
}

function round(text: string | null): string {
  return new EngineDecimal(text ?? 'NaN').toDecimalPlaces(ENGINE_GOLDEN_PLACES).toFixed();
}

async function checkDataset(context: BacktestTestContext, dataset: RealDataset): Promise<void> {
  const { symbol, timeframe } = dataset.market;
  if (timeframe !== '1h' && timeframe !== '1d') throw new Error('timeframe fora do conjunto');
  const window = windowOf(dataset);
  const run = await createBacktestRun(context, { symbol, timeframe, ...window });
  const outcome = await createTestRunner(context).run(run.id);
  assertCondition(outcome.status === 'completed', `${dataset.name}: terminou ${outcome.status}`);
  const persisted = await readPersistedRun(context, run.id);
  const metricsGolden = (await Bun.file(GOLDEN_METRICS_PATH).json()) as MetricsGolden;
  const engineGolden = (
    (await Bun.file(ENGINE_GOLDEN_PATH).json()) as {
      datasets: Record<string, EngineGoldenEntry>;
    }
  ).datasets[dataset.name];
  assertCondition(
    sameCanonicalJson(persisted.metrics, metricsGolden.datasets[dataset.name]),
    `${dataset.name}: as métricas gravadas diferem do dourado ${METRICS_VERSION}/${ENGINE_VERSION}`,
  );
  const metrics = persisted.metrics as RunMetrics;
  assertCondition(
    metrics.trades === engineGolden?.operations &&
      metrics.wins === engineGolden.wins &&
      metrics.feesPaid === engineGolden.feesPaid &&
      metrics.finalEquity === engineGolden.finalEquity &&
      round(metrics.maxDrawdownAtClose.depth) === engineGolden.maxDrawdownAtClose &&
      round(metrics.maxDrawdownAtLow.depth) === engineGolden.maxDrawdownAtLow &&
      round(metrics.benchmarkReturn.value) === engineGolden.buyAndHoldReturn,
    `${dataset.name}: operações, patrimônio ou drawdown diferem do dourado da T2.5`,
  );
  const direct = await runDirectly(context, { symbol, timeframe, ...window });
  assertCondition(
    sameCanonicalJson(persisted.rows, direct.expected) &&
      sameCanonicalJson(persisted.metrics, direct.metrics),
    `${dataset.name}: o gravado difere do mesmo motor direto`,
  );
  reportLine(
    `GOLDEN ${dataset.name}: ${metrics.trades} operações (${metrics.wins} ganhos), patrimônio final ${metrics.finalEquity}, ` +
      `queda máx. ${round(metrics.maxDrawdownAtLow.depth)} (mínima) / ${round(metrics.maxDrawdownAtClose.depth)} (fechamento), ` +
      `taxas ${metrics.feesPaid} — IGUAIS ao dourado de métricas ${METRICS_VERSION}/${ENGINE_VERSION} (inclusive posição aberta) e ao da T2.5`,
  );
}

export async function checkRealSets(context: BacktestTestContext): Promise<void> {
  for (const dataset of GOLDEN_DATASETS) await checkDataset(context, dataset);
  reportLine(
    `GOLDEN: período começa no candle ${LEAD_IN_CANDLES} (= leadIn) e vai ao último fechado; o aquecimento coincide com o do dourado, então o resultado é IGUAL byte a byte`,
  );
}
