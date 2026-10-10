// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { computeOpenPositionMetrics } from '../packages/strategy-engine/src/index.js';
import { buildMetricsParams } from './fixtures/strategy-engine/metrics/metrics-golden.fixture.js';
import {
  buildClassicScenario,
  GOLDEN_DATASETS,
  runClassicEngine,
} from './fixtures/strategy-engine/production/engine-golden.fixture.js';

describe.each(GOLDEN_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
  'open position metrics of the production engine: %s',
  (_name, dataset) => {
    const run = runClassicEngine(dataset);
    const last = run.at(-1);
    const parameters = buildClassicScenario(dataset).run.parameters;

    test('equals the independent reference of the metrics golden, to the last digit', () => {
      const reference = buildMetricsParams(dataset, run).openPosition;
      const computed = computeOpenPositionMetrics({
        wallet: last?.result.state.wallet ?? failMissingRun(),
        lastClose: last?.candle.close ?? failMissingRun(),
        parameters,
      });
      expect(computed).toStrictEqual(reference);
    });
  },
);

function failMissingRun(): never {
  throw new Error('execução vazia');
}

describe('open position metrics: the two branches', () => {
  test('the hourly set ends with an open position and the daily set does not', () => {
    const [hourly, daily] = GOLDEN_DATASETS.map((dataset) => {
      const last = runClassicEngine(dataset).at(-1);
      return computeOpenPositionMetrics({
        wallet: last?.result.state.wallet ?? failMissingRun(),
        lastClose: last?.candle.close ?? failMissingRun(),
        parameters: buildClassicScenario(dataset).run.parameters,
      });
    });
    expect(hourly?.unrealizedProfit).toBe('71.07365016');
    expect(daily).toBeNull();
  });
});
