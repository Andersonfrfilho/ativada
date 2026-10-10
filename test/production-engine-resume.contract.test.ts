// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createEngine,
  deserializeEngineState,
  serializeEngineState,
  type EngineState,
} from '../packages/strategy-engine/src/index.js';
import { runSteps, serializeRun } from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import type { RecordedStep } from './fixtures/strategy-engine/engine-contract-types.fixture.js';
import {
  buildClassicScenario,
  GOLDEN_DATASETS,
  runClassicEngine,
} from './fixtures/strategy-engine/production/engine-golden.fixture.js';
import type { RealDataset } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

const CUT_EVERY_CANDLES = 37;
const BATCH_SIZES: readonly number[] = [1, 5, 50];
const TIMEOUT_MILLISECONDS = 120_000;

function roundTrip(state: EngineState): EngineState {
  return deserializeEngineState(serializeEngineState(state));
}

function requireStep(run: readonly RecordedStep[], index: number): RecordedStep {
  const step = run[index];
  if (step === undefined) throw new Error(`Passo ${index} ausente.`);
  return step;
}

// Cada lote roda num motor novo, com o estado vindo do JSON do lote anterior: o que o ao vivo faz depois de
// cada reinício do processo.
function runInBatches(dataset: RealDataset, batchSize: number): RecordedStep[] {
  const scenario = buildClassicScenario(dataset);
  const steps: RecordedStep[] = [];
  let state = createEngine().createInitialState({
    strategy: scenario.strategy,
    run: scenario.run,
  });
  for (let start = 0; start < scenario.candles.length; start += batchSize) {
    const batch = runSteps({
      engine: createEngine(),
      scenario,
      candles: scenario.candles.slice(start, start + batchSize),
      initialState: roundTrip(state),
    });
    steps.push(...batch);
    state = requireStep(batch, batch.length - 1).result.state;
  }
  return steps;
}

describe.each(GOLDEN_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
  'complete engine resume and batching over real candles: %s',
  (_name, dataset: RealDataset) => {
    const scenario = buildClassicScenario(dataset);
    const continuous = runClassicEngine(dataset);

    test(
      `resuming from the serialized state at every ${CUT_EVERY_CANDLES}th candle gives the continuous run`,
      () => {
        let cuts = 0;
        for (
          let cut = CUT_EVERY_CANDLES - 1;
          cut < continuous.length - 1;
          cut += CUT_EVERY_CANDLES
        ) {
          const restored = roundTrip(requireStep(continuous, cut).result.state);
          const continuation = runSteps({
            engine: createEngine(),
            scenario,
            candles: scenario.candles.slice(cut + 1),
            initialState: restored,
          });
          const resumed = [...continuous.slice(0, cut + 1), ...continuation];
          expect(serializeRun(resumed) === serializeRun(continuous)).toBe(true);
          cuts += 1;
        }
        expect(cuts).toBeGreaterThanOrEqual(Math.floor(continuous.length / CUT_EVERY_CANDLES) - 1);
      },
      TIMEOUT_MILLISECONDS,
    );

    test.each(BATCH_SIZES.map((size) => [size] as const))(
      'batches of %i candles, each on a new engine from the serialized state, equal the continuous run',
      (size) => {
        const batched = runInBatches(dataset, size);
        expect(batched).toHaveLength(continuous.length);
        expect(serializeRun(batched) === serializeRun(continuous)).toBe(true);
      },
      TIMEOUT_MILLISECONDS,
    );

    test('the state serialized at the end is the same bytes, run after run', () => {
      const last = requireStep(continuous, continuous.length - 1).result.state;
      const again = requireStep(runClassicEngine(dataset), continuous.length - 1).result.state;
      expect(serializeEngineState(again)).toBe(serializeEngineState(last));
    });
  },
);
