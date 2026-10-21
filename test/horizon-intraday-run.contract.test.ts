// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createSentimentPicker } from '../packages/run-recording/src/index.js';
import {
  createEngine,
  createStrategyVersion,
  summarizeIntraday,
  type StoredSentimentObservation,
  type EngineCandle,
  type RunMetrics,
} from '../packages/strategy-engine/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { createHorizonsHarness } from './fixtures/api-routes/horizons-harness.fixture.js';
import { runGolden } from './fixtures/backtest/backtest-scenarios.fixture.js';
import { SUBJECT_A } from './fixtures/api-routes/runs-harness.fixture.js';
import { loadClassicScoreboard } from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import { runSteps } from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import {
  buildClassicScenario,
  GOLDEN_DATASETS,
} from './fixtures/strategy-engine/production/engine-golden.fixture.js';
import { CLASSIC_STRATEGY } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

const app = await loadApiApp();
const { computeIntradayMetrics, runIntradayInMemory } = app.horizonIntradayRun;

const RUN_TIMEOUT_MILLISECONDS = 120_000;
const BATCH_SIZE = 100;
const HOLE_LENGTH = 5;
const HORIZONS_SOURCE = join(import.meta.dir, '../apps/api-ativada/src/horizons');

function inMemory(
  dataset: (typeof GOLDEN_DATASETS)[number],
  candles: readonly EngineCandle[] = dataset.candles,
): RunMetrics | undefined {
  return computeIntradayMetrics({
    strategy: CLASSIC_STRATEGY,
    run: buildClassicScenario(dataset).run,
    candles,
    sentiments: undefined,
  });
}

function withHole(candles: readonly EngineCandle[], start: number): EngineCandle[] {
  return candles.filter((_candle, index) => index < start || index >= start + HOLE_LENGTH);
}

// Procura onde o buraco muda o que a carteira faz (saída por lacuna), com o motor direto: o teste de paridade precisa de um
// buraco que importe, senão declarar a lacuna ou não daria o mesmo resultado.
function findHoleThatMatters(dataset: (typeof GOLDEN_DATASETS)[number]): number {
  for (let start = 200; start < 420; start += 7) {
    const run = runSteps({
      engine: createEngine(),
      scenario: { ...buildClassicScenario(dataset), candles: withHole(dataset.candles, start) },
    });
    const exits = run.flatMap((step) =>
      step.result.decisions.closedPositions.map((closed) => closed.exitReason),
    );
    if (exits.includes('gap')) return start;
  }
  throw new Error('nenhum buraco relevante achado no conjunto real');
}

describe.each(GOLDEN_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
  'a linha de 15 minutos em memória é o backtest gravado: %s',
  (_name, dataset) => {
    test(
      'as métricas inteiras (operações, patrimônio final, taxas, drawdown…) são idênticas às do backtest',
      async () => {
        const recorded = await runGolden(dataset, {}, { batchSize: BATCH_SIZE });
        expect(recorded.outcome.status).toBe('completed');
        const metrics = recorded.memory.state.metrics as RunMetrics;
        expect(metrics.trades).toBeGreaterThan(0);
        expect(inMemory(dataset)).toStrictEqual(metrics);
        expect(
          runIntradayInMemory({
            strategy: CLASSIC_STRATEGY,
            run: buildClassicScenario(dataset).run,
            candles: dataset.candles,
            sentiments: undefined,
          }),
        ).toStrictEqual(summarizeIntraday(metrics));
      },
      RUN_TIMEOUT_MILLISECONDS,
    );

    test(
      'com um buraco nos candles a lacuna é declarada ao motor como no backtest, e muda o resultado',
      async () => {
        const holeStart = findHoleThatMatters(dataset);
        const candles = withHole(dataset.candles, holeStart);
        const recorded = await runGolden(dataset, { candles }, { batchSize: BATCH_SIZE });
        expect(recorded.outcome.status).toBe('completed');
        const metrics = recorded.memory.state.metrics as RunMetrics;
        expect(inMemory(dataset, candles)).toStrictEqual(metrics);
        expect(inMemory(dataset, candles)).not.toStrictEqual(inMemory(dataset));
      },
      RUN_TIMEOUT_MILLISECONDS,
    );
  },
);

const SENTIMENT_STRATEGY = createStrategyVersion({
  ...loadClassicScoreboard(),
  rules: [
    ...(loadClassicScoreboard().rules ?? []),
    { id: 'fear-greed', kind: 'fear_greed', fearAtOrBelow: 25, greedAtOrAbove: 75 },
  ],
});
const SENTIMENT_EVERY_CANDLES = 24;
const FEAR = 20;
const GREED = 80;

// Uma leitura do índice a cada 24 candles, alternando medo e ganância, disponível no fechamento do candle.
function buildObservations(candles: readonly EngineCandle[]): StoredSentimentObservation[] {
  return candles.flatMap((candle, index) =>
    index % SENTIMENT_EVERY_CANDLES === 0
      ? [
          {
            value: (index / SENTIMENT_EVERY_CANDLES) % 2 === 0 ? FEAR : GREED,
            observedAt: candle.closeTime,
            createdAt: candle.closeTime,
            source: 'alternative.me',
          },
        ]
      : [],
  );
}

describe('a linha de 15 minutos em memória', () => {
  test(
    'com regra de sentimento as métricas continuam idênticas às do backtest gravado',
    async () => {
      const [dataset] = GOLDEN_DATASETS;
      if (dataset === undefined) throw new Error('conjunto real ausente');
      const observations = buildObservations(dataset.candles);
      const recorded = await runGolden(
        dataset,
        { strategy: SENTIMENT_STRATEGY, sentiment: observations },
        { batchSize: BATCH_SIZE },
      );
      const run = buildClassicScenario(dataset).run;
      const pick = createSentimentPicker({ observations, source: run.parameters.sentimentSource });
      const withSentiment = computeIntradayMetrics({
        strategy: SENTIMENT_STRATEGY,
        run,
        candles: dataset.candles,
        sentiments: dataset.candles.map(pick),
      });
      const withoutSentiment = computeIntradayMetrics({
        strategy: SENTIMENT_STRATEGY,
        run,
        candles: dataset.candles,
        sentiments: undefined,
      });
      expect(withSentiment).toStrictEqual(recorded.memory.state.metrics as RunMetrics);
      expect(withSentiment).not.toStrictEqual(withoutSentiment);
    },
    RUN_TIMEOUT_MILLISECONDS,
  );

  test('sem candle nenhum não há resultado', () => {
    const [dataset] = GOLDEN_DATASETS;
    if (dataset === undefined) throw new Error('conjunto real ausente');
    expect(inMemory(dataset, [])).toBeUndefined();
    expect(
      runIntradayInMemory({
        strategy: CLASSIC_STRATEGY,
        run: buildClassicScenario(dataset).run,
        candles: [],
        sentiments: undefined,
      }),
    ).toBeNull();
  });

  test(
    'não grava nada em runs: nenhuma execução nasce, nada vai à fila nem ao banco',
    async () => {
      const harness = await createHorizonsHarness({ symbols: ['BTCUSDT'] });
      try {
        await harness.seedStrategy(SUBJECT_A, 'principal');
        const before = harness.runs.all().length;
        const result = await harness.evaluateHorizons(harness.scopeOf(SUBJECT_A), {
          symbol: 'BTCUSDT',
          strategyId: undefined,
        });
        expect(result.intraday?.summary.tradeCount).toBeGreaterThan(0);
        expect(harness.runs.all()).toHaveLength(before);
        expect(harness.dispatched).toHaveLength(0);
        expect(Object.values(harness.runs.listCalls).flat()).toStrictEqual([]);
      } finally {
        await harness.stop();
      }
    },
    RUN_TIMEOUT_MILLISECONDS,
  );

  test('o módulo dos prazos não conhece escritor de execução: nem repositório de runs, nem lote, nem despachante', () => {
    const forbidden =
      /createRunRepository|createRunResultRepository|createRunBatchRepository|appendDecisions|createBatchBuffer|toRunResultRows|RunDispatcher|runBacktest|\bappend[A-Z]\w*\(/;
    const files = readdirSync(HORIZONS_SOURCE).filter((file) => file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      expect(readFileSync(join(HORIZONS_SOURCE, file), 'utf8')).not.toMatch(forbidden);
    }
  });
});
