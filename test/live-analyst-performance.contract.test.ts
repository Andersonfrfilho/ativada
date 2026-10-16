// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, test } from 'bun:test';

import { ANALYST_REAL_DATASET, buildAnalystLive } from './fixtures/live/analyst-live.fixture.js';
import {
  combineLives,
  type InMemoryLive,
} from './fixtures/live/in-memory-live-database.fixture.js';
import { createTestEvaluator } from './fixtures/live/live-scenarios.fixture.js';

// RNF06 da spec 007: o passo do analista custa no máximo 50 ms (p95) por simulação por vela, com a série cheia de 30 dias
// (≈ 3.100 velas de 15 min) e 5 simulações do MESMO par na ronda. Mede a diferença entre a ronda com e sem a sombra, vela a
// vela, dividida pelas simulações. Fica fora do julgamento dos mutantes: o relógio de uma máquina ocupada não é contrato.

const SIMULATIONS = 5;
const BUDGET_MILLISECONDS = 50;
const MAXIMUM_TICKS = 2_000;
const PERCENTILE = 0.95;

async function tickDurations(withAnalyst: boolean): Promise<readonly number[]> {
  const periodStart = ANALYST_REAL_DATASET.candles[3050]?.openTime ?? 0;
  const lives: InMemoryLive[] = Array.from({ length: SIMULATIONS }, () =>
    buildAnalystLive({ withAnalyst, overrides: { periodStart } }),
  );
  const { evaluator } = await createTestEvaluator(combineLives(lives), { maxStepsPerPass: 1 });
  const durations: number[] = [];
  for (let tick = 0; tick < MAXIMUM_TICKS; tick += 1) {
    const started = performance.now();
    const summary = await evaluator.tick();
    if (summary.steps === 0) break;
    durations.push(performance.now() - started);
  }
  if (withAnalyst) {
    for (const live of lives) expect(live.state.analystDecisions.size).toBe(live.state.commits);
  }
  return durations;
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}

test(`o passo do analista custa até ${BUDGET_MILLISECONDS} ms (p95) por simulação por vela, com 5 simulações do mesmo par`, async () => {
  const plain = await tickDurations(false);
  const shadow = await tickDurations(true);
  expect(shadow.length).toBe(plain.length);
  expect(shadow.length).toBeGreaterThan(250);
  const overhead = shadow.map(
    (duration, index) => Math.max(0, duration - (plain[index] ?? 0)) / SIMULATIONS,
  );
  const p50 = percentile(overhead, 0.5);
  const p95 = percentile(overhead, PERCENTILE);
  const worst = Math.max(...overhead);
  process.stdout.write(
    `analista em sombra, ${shadow.length} velas x ${SIMULATIONS} simulações: p50 ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, máximo ${worst.toFixed(2)} ms por simulação por vela\n`,
  );
  expect(p95).toBeLessThanOrEqual(BUDGET_MILLISECONDS);
}, 300_000);
