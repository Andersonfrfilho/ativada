// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  canonicalJson,
  computeStrategyLeadInCandles,
  type EngineCandle,
} from '../../../packages/strategy-engine/src/index.js';
import type {
  BacktestOptions,
  BacktestOutcome,
} from '../../../apps/api-cryptoada/src/backtest/backtest.types.js';
import { buildClassicScenario } from '../strategy-engine/production/engine-golden.fixture.js';
import {
  CLASSIC_STRATEGY,
  type RealDataset,
} from '../strategy-engine/signal/classic-signals.fixture.js';
import { loadBacktestApi } from './backtest-api.fixture.js';
import {
  createInMemoryBacktest,
  type InMemoryBacktest,
} from './in-memory-backtest-database.fixture.js';
import type { InMemoryScenario } from './in-memory-backtest-types.fixture.js';

export const LEAD_IN_CANDLES = computeStrategyLeadInCandles(CLASSIC_STRATEGY.config);

export type ScenarioOverrides = Partial<Omit<InMemoryScenario, 'candles'>> & {
  readonly candles?: readonly EngineCandle[];
};

export type BacktestRunResult = {
  readonly memory: InMemoryBacktest;
  readonly outcome: BacktestOutcome;
  readonly now: number;
};

// O período do dourado do motor: começa no candle que vem DEPOIS do pré-aquecimento e acaba no último fechado.
export function buildGoldenMemory(
  dataset: RealDataset,
  overrides: ScenarioOverrides = {},
): InMemoryBacktest {
  const candles = overrides.candles ?? dataset.candles;
  const periodStart = candles[LEAD_IN_CANDLES]?.openTime ?? Number.MAX_SAFE_INTEGER;
  const periodEnd = (candles.at(-1)?.closeTime ?? 0) + 1;
  const setup = buildClassicScenario(dataset).run;
  return createInMemoryBacktest({
    runParameters: structuredClone(setup.parameters),
    runHash: setup.runHash,
    scenario: { candles, periodStart, periodEnd, ...overrides },
  });
}

export async function runGolden(
  dataset: RealDataset,
  overrides: ScenarioOverrides = {},
  options: BacktestOptions = {},
): Promise<BacktestRunResult> {
  const memory = buildGoldenMemory(dataset, overrides);
  return runInMemory(memory, options);
}

export async function runInMemory(
  memory: InMemoryBacktest,
  options: BacktestOptions = {},
): Promise<BacktestRunResult> {
  const { runBacktest } = await loadBacktestApi();
  const now = Date.now();
  const outcome = await runBacktest({
    database: memory.database,
    runId: memory.runId,
    options: { now: () => now, ...options },
  });
  return { memory, outcome, now };
}

// Digest de tudo o que a execução deixou: resultados, status, métricas e o checkpoint final.
export function digestOfRun(memory: InMemoryBacktest): string {
  const content = {
    results: memory.snapshot(),
    status: memory.state.status,
    errorCode: memory.state.errorCode ?? null,
    metrics: memory.state.metrics ?? null,
    lastCandleTime: memory.state.checkpoint?.lastCandleTime ?? null,
    engineState: memory.state.checkpoint?.engineState ?? null,
  };
  return new Bun.CryptoHasher('sha256')
    .update(canonicalJson(JSON.parse(JSON.stringify(content))))
    .digest('hex');
}
