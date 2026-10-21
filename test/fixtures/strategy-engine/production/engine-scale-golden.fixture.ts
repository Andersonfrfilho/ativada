// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createEngine,
  ENGINE_VERSION,
  type EntryRiskScale,
} from '../../../../packages/strategy-engine/src/index.js';
import { runSteps } from '../engine-contract-runs.fixture.js';
import type {
  EngineScenario,
  RecordedStep,
  ScenarioEntryRiskScales,
} from '../engine-contract-types.fixture.js';
import type { RealDataset } from '../signal/classic-signals.fixture.js';
import {
  buildClassicScenario,
  GOLDEN_DATASETS,
  summarizeEngineRun,
  type EngineGoldenSummary,
} from './engine-golden.fixture.js';

// Dourado do teto de entrada por passo (ADR 0002 A21): o Placar clássico sobre os conjuntos REAIS com a escala
// de cada candle num ciclo fixo, inclusive candle sem escala. Mesma versão do motor: a escala é entrada do passo.
export const ENTRY_SCALE_CYCLE: readonly (EntryRiskScale | undefined)[] = [
  '1',
  '0.5',
  '0.25',
  '0',
  undefined,
  '0.25',
  '0',
];

export const ENTRY_SCALE_GOLDEN_PATH = `${new URL('../golden/', import.meta.url).pathname}classic-scoreboard-engine-entry-scale.${ENGINE_VERSION}.json`;

export type EntryScaleGolden = {
  readonly engineVersion: string;
  readonly cycle: readonly (EntryRiskScale | null)[];
  readonly datasets: Readonly<Record<string, EngineGoldenSummary>>;
};

export function entryScalesOf(
  dataset: RealDataset,
  cycle: readonly (EntryRiskScale | undefined)[],
): ScenarioEntryRiskScales {
  const entries = dataset.candles.flatMap((candle, index) => {
    const scale = cycle[index % cycle.length];
    return scale === undefined ? [] : [[candle.openTime, scale] as const];
  });
  return Object.fromEntries(entries);
}

export function buildScaledClassicScenario(
  dataset: RealDataset,
  cycle: readonly (EntryRiskScale | undefined)[] = ENTRY_SCALE_CYCLE,
): EngineScenario {
  return { ...buildClassicScenario(dataset), entryRiskScales: entryScalesOf(dataset, cycle) };
}

export function runScaledClassicEngine(
  dataset: RealDataset,
  cycle: readonly (EntryRiskScale | undefined)[] = ENTRY_SCALE_CYCLE,
): RecordedStep[] {
  return runSteps({ engine: createEngine(), scenario: buildScaledClassicScenario(dataset, cycle) });
}

export function buildEntryScaleGolden(): EntryScaleGolden {
  const datasets = GOLDEN_DATASETS.map((dataset) => {
    const { initialBalance } = buildClassicScenario(dataset).run.parameters;
    const summary = summarizeEngineRun(runScaledClassicEngine(dataset), initialBalance);
    return [dataset.name, summary] as const;
  });
  return {
    engineVersion: ENGINE_VERSION,
    cycle: ENTRY_SCALE_CYCLE.map((scale) => scale ?? null),
    datasets: Object.fromEntries(datasets),
  };
}
