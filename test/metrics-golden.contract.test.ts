// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeRunMetrics,
  ENGINE_VERSION,
  EngineDecimal,
  METRICS_VERSION,
  reconcileRunMetrics,
} from '../packages/strategy-engine/src/index.js';
import {
  buildMetricsParams,
  GOLDEN_METRICS_PATH,
  type MetricsGolden,
} from './fixtures/strategy-engine/metrics/metrics-golden.fixture.js';
import {
  GOLDEN_DATASETS,
  runClassicEngine,
  type EngineGoldenSummary,
} from './fixtures/strategy-engine/production/engine-golden.fixture.js';

const ENGINE_GOLDEN_PATH = `${new URL('./fixtures/strategy-engine/golden/', import.meta.url).pathname}classic-scoreboard-engine.${ENGINE_VERSION}.json`;
const RUN_TIMEOUT_MILLISECONDS = 120_000;
const RATIO_PLACES_PATTERN = /^-?\d+(\.\d{1,12})?$/;
const MONEY_PLACES_PATTERN = /^-?\d+(\.\d{1,8})?$/;
const ENGINE_GOLDEN_PLACES = 8;

async function readMetricsGolden(): Promise<MetricsGolden> {
  const file = Bun.file(GOLDEN_METRICS_PATH);
  if (!(await file.exists())) {
    throw new Error(
      `Grave o dourado das métricas ${METRICS_VERSION}/${ENGINE_VERSION}: bun run scripts/record-metrics-golden.ts`,
    );
  }
  return (await file.json()) as MetricsGolden;
}

async function readEngineGolden(): Promise<Record<string, EngineGoldenSummary>> {
  const golden = (await Bun.file(ENGINE_GOLDEN_PATH).json()) as {
    datasets: Record<string, EngineGoldenSummary>;
  };
  return golden.datasets;
}

describe.each(GOLDEN_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
  'metrics of the complete engine over real candles: %s',
  (name, dataset) => {
    const run = runClassicEngine(dataset);
    const params = buildMetricsParams(dataset, run);
    const metrics = computeRunMetrics(params);

    test(
      'is reproducible and equals the golden of this metrics and engine version',
      async () => {
        expect(
          computeRunMetrics(buildMetricsParams(dataset, runClassicEngine(dataset))),
        ).toStrictEqual(metrics);
        const golden = await readMetricsGolden();
        expect(golden.metricsVersion).toBe(METRICS_VERSION);
        expect(golden.engineVersion).toBe(ENGINE_VERSION);
        expect(golden.datasets[name]).toStrictEqual(metrics);
      },
      RUN_TIMEOUT_MILLISECONDS,
    );

    test('the books close to the last digit: realized + unrealized = final equity − initial balance', () => {
      const books = reconcileRunMetrics(metrics);
      expect(books.isReconciled).toBe(true);
      expect(books.difference).toBe('0');
      expect(books.expectedVariation).not.toBe('0');
    });

    test('agrees with the engine golden of T2.5 (8 places there, 12 here)', async () => {
      const engine = (await readEngineGolden())[name];
      const round = (text: string | null): string =>
        new EngineDecimal(text ?? 'NaN').toDecimalPlaces(ENGINE_GOLDEN_PLACES).toFixed();
      expect(metrics.trades).toBe(engine?.operations ?? -1);
      expect(metrics.wins).toBe(engine?.wins ?? -1);
      expect(metrics.feesPaid).toBe(engine?.feesPaid ?? '');
      expect(metrics.finalEquity).toBe(engine?.finalEquity ?? '');
      expect(round(metrics.maxDrawdownAtClose.depth)).toBe(engine?.maxDrawdownAtClose ?? '');
      expect(round(metrics.maxDrawdownAtLow.depth)).toBe(engine?.maxDrawdownAtLow ?? '');
      expect(round(metrics.benchmarkReturn.value)).toBe(engine?.buyAndHoldReturn ?? '');
    });

    test('every number is decimal text with the declared places: 12 for ratios, 8 for money', () => {
      const ratios = [
        metrics.totalReturn,
        metrics.benchmarkReturn,
        metrics.excessReturn,
        metrics.annualizedReturn,
        metrics.sharpe,
        metrics.sortino,
        metrics.winRate,
        metrics.profitFactor,
        metrics.averageTrade,
        metrics.expectancy,
        metrics.averageWin,
        metrics.averageLoss,
        metrics.payoffRatio,
        metrics.exposure,
        metrics.tradesPerYear,
      ];
      for (const ratio of ratios) {
        if (ratio.value !== null) expect(ratio.value).toMatch(RATIO_PLACES_PATTERN);
      }
      for (const money of [
        metrics.feesPaid,
        metrics.grossProfit,
        metrics.grossLoss,
        metrics.netProfit,
      ]) {
        expect(money).toMatch(MONEY_PLACES_PATTERN);
      }
      expect(metrics.maxDrawdownAtLow.depth).toMatch(RATIO_PLACES_PATTERN);
    });

    test('is a pure function of the points: the engine is not consulted again', () => {
      expect(computeRunMetrics(structuredClone(params))).toStrictEqual(metrics);
    });
  },
);

describe('the golden is pinned to the versions', () => {
  test('the file name carries the metrics and the engine version and covers every dataset', async () => {
    expect(GOLDEN_METRICS_PATH).toContain(`.${METRICS_VERSION}.${ENGINE_VERSION}.json`);
    const golden = await readMetricsGolden();
    expect(Object.keys(golden.datasets).sort()).toStrictEqual(
      GOLDEN_DATASETS.map((dataset) => dataset.name).sort(),
    );
  });

  test('the two real sets cover both branches: a short period (no annualized) and a long one', async () => {
    const golden = await readMetricsGolden();
    const [hourly, daily] = GOLDEN_DATASETS.map((dataset) => golden.datasets[dataset.name]);
    expect(hourly?.annualizedReturn.reason).toBe('period_too_short');
    expect(hourly?.openPosition).not.toBeNull();
    expect(daily?.annualizedReturn.reason).toBeNull();
    expect(daily?.openPosition).toBeNull();
  });
});
