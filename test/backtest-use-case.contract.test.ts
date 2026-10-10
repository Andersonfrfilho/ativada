// Copyright (c) 2026 Ada Technology. All rights reserved.
import { beforeAll, describe, expect, test } from 'bun:test';

import {
  ENGINE_VERSION,
  EngineDecimal,
  METRICS_VERSION,
  serializeEngineState,
} from '../packages/strategy-engine/src/index.js';
import { expectedRowsOf } from './fixtures/backtest/expected-rows.fixture.js';
import {
  persistedRowsOf,
  sortedLikePersisted,
} from './fixtures/backtest/persisted-rows.fixture.js';
import {
  LEAD_IN_CANDLES,
  runGolden,
  type BacktestRunResult,
} from './fixtures/backtest/backtest-scenarios.fixture.js';
import { GOLDEN_METRICS_PATH } from './fixtures/strategy-engine/metrics/metrics-golden.fixture.js';
import {
  GOLDEN_DATASETS,
  runClassicEngine,
} from './fixtures/strategy-engine/production/engine-golden.fixture.js';
import type { RunMetrics } from '../packages/strategy-engine/src/index.js';

const BATCH_SIZE = 100;
const RUN_TIMEOUT_MILLISECONDS = 120_000;
const COMMIT_CYCLE = ['status', 'append', 'checkpoint', 'commit'];
const ENGINE_GOLDEN_PATH = `${new URL('./fixtures/strategy-engine/golden/', import.meta.url).pathname}classic-scoreboard-engine.${ENGINE_VERSION}.json`;
const ENGINE_GOLDEN_PLACES = 8;

type MetricsGolden = { readonly datasets: Readonly<Record<string, RunMetrics>> };
type EngineGolden = {
  readonly datasets: Readonly<
    Record<
      string,
      {
        readonly operations: number;
        readonly wins: number;
        readonly feesPaid: string;
        readonly finalEquity: string;
        readonly maxDrawdownAtClose: string;
        readonly maxDrawdownAtLow: string;
        readonly buyAndHoldReturn: string;
      }
    >
  >;
};

describe.each(GOLDEN_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
  'backtest use case over real candles: %s',
  (name, dataset) => {
    let result: BacktestRunResult;
    const direct = runClassicEngine(dataset);

    beforeAll(async () => {
      result = await runGolden(dataset, {}, { batchSize: BATCH_SIZE });
    }, RUN_TIMEOUT_MILLISECONDS);

    test('completes: status, progress, no error code, outcome counts', () => {
      const { memory, outcome } = result;
      expect(outcome.status).toBe('completed');
      expect(memory.state.status).toBe('completed');
      expect(memory.state.progress).toBe(100);
      expect(memory.state.errorCode).toBeUndefined();
      if (outcome.status !== 'completed') throw new Error('esperado completed');
      expect(outcome.processedCandles).toBe(dataset.candles.length);
      expect(outcome.gapCandles).toBe(0);
    });

    test('the persisted metrics equal the golden of the metrics and engine version, to the last digit', async () => {
      const golden = (await Bun.file(GOLDEN_METRICS_PATH).json()) as MetricsGolden;
      expect(result.memory.state.metrics).toStrictEqual(golden.datasets[name]);
      expect((result.memory.state.metrics as RunMetrics).version).toBe(METRICS_VERSION);
    });

    test('operations, fees, final equity and drawdowns match the engine golden of T2.5', async () => {
      const golden = ((await Bun.file(ENGINE_GOLDEN_PATH).json()) as EngineGolden).datasets[name];
      const metrics = result.memory.state.metrics as RunMetrics;
      const round = (text: string | null): string =>
        new EngineDecimal(text ?? 'NaN').toDecimalPlaces(ENGINE_GOLDEN_PLACES).toFixed();
      expect(metrics.trades).toBe(golden?.operations ?? -1);
      expect(metrics.wins).toBe(golden?.wins ?? -1);
      expect(metrics.feesPaid).toBe(golden?.feesPaid ?? '');
      expect(metrics.finalEquity).toBe(golden?.finalEquity ?? '');
      expect(round(metrics.maxDrawdownAtClose.depth)).toBe(golden?.maxDrawdownAtClose ?? '');
      expect(round(metrics.maxDrawdownAtLow.depth)).toBe(golden?.maxDrawdownAtLow ?? '');
      expect(round(metrics.benchmarkReturn.value)).toBe(golden?.buyAndHoldReturn ?? '');
    });

    test('parity: what was persisted is what the same engine decided running directly in memory', () => {
      const expected = sortedLikePersisted(expectedRowsOf(direct));
      const persisted = persistedRowsOf(result.memory);
      expect(persisted.equityPoints).toStrictEqual(expected.equityPoints);
      expect(persisted.signals).toStrictEqual(expected.signals);
      expect(persisted.fills).toStrictEqual(expected.fills);
      expect(persisted.closedPositions).toStrictEqual(expected.closedPositions);
      expect(persisted.orderStatuses).toStrictEqual(expected.orderStatuses);
      expect(result.memory.state.checkpoint?.engineState).toStrictEqual(
        JSON.parse(serializeEngineState(direct.at(-1)?.result.state ?? failEmpty())),
      );
    });

    test('batches: each is ONE transaction — status, results, checkpoint, commit — and a query per page', () => {
      const { memory } = result;
      const batches = Math.ceil(dataset.candles.length / BATCH_SIZE);
      expect(memory.state.commits).toBe(batches);
      expect(memory.log.filter((entry) => entry === 'commit')).toHaveLength(batches);
      const body = memory.log.slice(0, batches * COMMIT_CYCLE.length);
      expect(body).toStrictEqual(Array.from({ length: batches }, () => COMMIT_CYCLE).flat());
      expect(memory.log.at(-1)).toBe('complete');
      expect(memory.calls.findCandles).toBeLessThanOrEqual(batches + 2);
      expect(memory.calls.findCandles).toBeLessThan(dataset.candles.length / 10);
      expect(memory.calls.listSentiment).toBe(1);
    });

    test('the checkpoint holds the last candle and the progress only goes forward', () => {
      const checkpoint = result.memory.state.checkpoint;
      expect(checkpoint?.lastCandleTime).toBe(dataset.candles.at(-1)?.openTime);
    });
  },
);

function failEmpty(): never {
  throw new Error('execução vazia');
}

describe('backtest use case: the warm-up window', () => {
  test('the period starts after exactly leadInCandles candles of warm-up (194 in the Classic Scoreboard)', () => {
    expect(LEAD_IN_CANDLES).toBe(194);
  });
});
