// Copyright (c) 2026 Ada Technology. All rights reserved.
import { writeFileSync } from 'node:fs';
import { parentPort } from 'node:worker_threads';

import { createRunSetup } from '../../../packages/strategy-engine/src/index.js';
import { loadClassicRunParameters } from '../strategy-engine/engine-scenarios.fixture.js';
import { buildGoldenMemory } from './backtest-scenarios.fixture.js';
import { resolveBacktestSource } from './backtest-api.fixture.js';
import { createInMemoryBacktest } from './in-memory-backtest-database.fixture.js';
import { buildTwoYearSyntheticSeries } from './synthetic-candles.fixture.js';
import { LEAD_IN_CANDLES } from './backtest-scenarios.fixture.js';
import { GOLDEN_DATASETS } from '../strategy-engine/production/engine-golden.fixture.js';

// Entrada de thread SÓ dos testes: o motor e o caso de uso são os de verdade (ou a cópia mutada, apontada por
// `BACKTEST_MUTANT_SOURCE`); só o banco é em memória e o comportamento estranho é escolhido por `TEST_WORKER_MODE`.
const MODE = Bun.env.TEST_WORKER_MODE ?? 'golden';
const HEARTBEAT_FILE = Bun.env.TEST_HEARTBEAT_FILE;
const CLOSE_MARKER_FILE = Bun.env.TEST_CLOSE_FILE;
const HEARTBEAT_INTERVAL_MILLISECONDS = 20;
const EXIT_CODE = 7;

type ServeModule = {
  readonly serveBacktestWorker: (dependencies: {
    readonly open: () => Promise<{
      readonly database: ReturnType<typeof createInMemoryBacktest>['database'];
      readonly close: () => Promise<void>;
    }>;
  }) => void;
};

function isServeModule(candidate: unknown): candidate is ServeModule {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof Object.getOwnPropertyDescriptor(candidate, 'serveBacktestWorker')?.value === 'function'
  );
}

function openMemory(): ReturnType<typeof createInMemoryBacktest> {
  if (MODE === 'synthetic') {
    const candles = buildTwoYearSyntheticSeries();
    const setup = createRunSetup(loadClassicRunParameters());
    return createInMemoryBacktest({
      runParameters: structuredClone(setup.parameters),
      runHash: setup.runHash,
      scenario: {
        candles,
        periodStart: candles[LEAD_IN_CANDLES]?.openTime ?? 0,
        periodEnd: (candles.at(-1)?.closeTime ?? 0) + 1,
      },
    });
  }
  const dataset = GOLDEN_DATASETS[0];
  if (dataset === undefined) throw new Error('conjunto real ausente');
  return buildGoldenMemory(dataset);
}

function startHeartbeat(): void {
  if (HEARTBEAT_FILE === undefined) return;
  let beats = 0;
  setInterval(() => {
    beats += 1;
    writeFileSync(HEARTBEAT_FILE, String(beats));
  }, HEARTBEAT_INTERVAL_MILLISECONDS);
}

async function main(): Promise<void> {
  const port = parentPort;
  if (port === null) throw new Error('fora de uma thread');
  startHeartbeat();
  if (MODE === 'silent') port.on('message', () => undefined);
  if (MODE === 'exit') port.on('message', () => process.exit(EXIT_CODE));
  if (MODE === 'throw')
    port.on('message', () =>
      setTimeout(() => {
        throw new Error('boom');
      }, 0),
    );
  if (MODE === 'hang')
    port.on('message', () => {
      for (;;) {
        /* ocupa a thread */
      }
    });
  if (MODE === 'garbage')
    port.on('message', () => port.postMessage({ type: 'completed', engineState: {} }));
  if (['exit', 'throw', 'hang', 'garbage', 'silent'].includes(MODE)) {
    port.postMessage({ type: 'ready' });
    return;
  }
  const loaded: unknown = await import(`${resolveBacktestSource()}/serve-backtest-worker.ts`);
  if (!isServeModule(loaded)) throw new Error('módulo da thread sem serveBacktestWorker');
  loaded.serveBacktestWorker({
    open: () => {
      const memory = openMemory();
      return Promise.resolve({
        database: memory.database,
        close: () => {
          if (CLOSE_MARKER_FILE !== undefined) writeFileSync(CLOSE_MARKER_FILE, 'closed');
          return Promise.resolve();
        },
      });
    },
  });
}

await main();
