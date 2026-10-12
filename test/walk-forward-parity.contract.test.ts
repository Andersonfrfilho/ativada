// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { WalletSpan } from '../apps/api-ativada/src/walk-forward/window-spans.js';
import {
  computeStrategyLeadInCandles,
  createStrategyVersion,
  planWalkForwardWindows,
} from '../packages/strategy-engine/src/index.js';
import { REAL_DATASETS } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  buildDailyCandles,
  DAY_MILLISECONDS,
} from './fixtures/walk-forward/daily-candles.fixture.js';
import {
  buildParityCase,
  buildSeries,
  computeWindowStartSignals,
  runFullEngine,
  runPipeline,
  type ParityCase,
} from './fixtures/walk-forward/parity-harness.fixture.js';
import {
  SCENARIO_END,
  SCENARIO_START,
  SHORT_STRATEGY,
} from './fixtures/walk-forward/walk-forward-scenarios.fixture.js';

import { loadWalkForwardApp } from './fixtures/walk-forward/walk-forward-app.fixture.js';

const { locateWindows } = (await loadWalkForwardApp()).spans;

const MINIMUM_WINDOWS = 3;

function syntheticCase(): ParityCase {
  return buildParityCase({
    candles: buildDailyCandles({
      count: 300 + Math.round((SCENARIO_END - SCENARIO_START) / DAY_MILLISECONDS),
      seed: 20_261_018,
      firstOpenTime: SCENARIO_START - 300 * DAY_MILLISECONDS,
    }),
    strategy: createStrategyVersion(SHORT_STRATEGY),
    parameters: {
      schemaVersion: 1,
      symbol: 'BTCUSDT',
      timeframe: '1d',
      sentimentSource: 'fixture',
    },
  });
}

function expectParity(parityCase: ParityCase, spans: readonly WalletSpan[]): void {
  expect(spans.length).toBeGreaterThanOrEqual(MINIMUM_WINDOWS);
  spans.forEach((span, index) => {
    const prefix = `w${index}:`;
    const reference = runFullEngine({ parityCase, span, keyPrefix: prefix });
    const signals = computeWindowStartSignals(parityCase, span);
    const pipeline = runPipeline({ parityCase, span, keyPrefix: prefix, signals });
    expect(pipeline.length).toBe(reference.length);
    expect(pipeline.length).toBe(span.limitIndex - span.anchorIndex);
    expect(pipeline).toEqual(reference);
  });
}

describe('paridade: sinal calculado uma vez + carteira por janela ≡ motor completo por janela', () => {
  test('dados sintéticos: as quatro janelas do plano (6/2/2), decisão por decisão', () => {
    const parityCase = syntheticCase();
    const series = buildSeries(parityCase.candles, parityCase.setup);
    const windows = planWalkForwardWindows({ start: SCENARIO_START, end: SCENARIO_END });
    const spans = locateWindows(series, windows);
    expectParity(
      parityCase,
      spans.map((item) => item.test),
    );
    expectParity(
      parityCase,
      spans.map((item) => item.train),
    );
  });

  test.each(REAL_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
    'dados reais %s: três janelas sobrepostas',
    (_name, dataset) => {
      const parityCase = buildParityCase({
        candles: dataset.candles,
        strategy: createStrategyVersion(SHORT_STRATEGY),
        parameters: {
          schemaVersion: 1,
          symbol: dataset.market.symbol,
          timeframe: dataset.market.timeframe,
          sentimentSource: 'fixture',
        },
      });
      const leadIn = computeStrategyLeadInCandles(parityCase.strategy.config);
      const size = Math.floor((dataset.candles.length - leadIn - 20) / 2);
      const spans: WalletSpan[] = [0, 1, 2].map((offset) => ({
        anchorIndex: leadIn + offset * Math.floor(size / 3),
        limitIndex: leadIn + offset * Math.floor(size / 3) + size,
      }));
      expectParity(parityCase, spans);
    },
  );

  test('a carteira avulsa sobre o sinal da série contínua difere do motor iniciado na janela só pelo peso residual do primeiro candle', () => {
    const parityCase = syntheticCase();
    const series = buildSeries(parityCase.candles, parityCase.setup);
    const windows = planWalkForwardWindows({ start: SCENARIO_START, end: SCENARIO_END });
    const spans = locateWindows(series, windows).map((item) => item.test);
    const [firstSpan] = spans;
    if (firstSpan === undefined) throw new Error('sem janela');
    const continuous = computeWindowStartSignals(parityCase, {
      anchorIndex: firstSpan.anchorIndex,
      limitIndex: spans.at(-1)?.limitIndex ?? 0,
    });
    let differing = 0;
    let compared = 0;
    for (const span of spans) {
      const own = computeWindowStartSignals(parityCase, span);
      for (let index = span.anchorIndex; index < span.limitIndex; index += 1) {
        compared += 1;
        if (own.at(index)?.action !== continuous.at(index)?.action) differing += 1;
      }
    }
    // medido e documentado no ADR: a ação diverge em uma fração mínima dos candles
    expect(differing / compared).toBeLessThan(0.05);
  });
});
