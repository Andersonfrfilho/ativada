// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { SearchInput } from '../apps/api-cryptoada/src/walk-forward/search-input.js';
import { loadWalkForwardApp } from './fixtures/walk-forward/walk-forward-app.fixture.js';
import { buildWalkForwardScenario } from './fixtures/walk-forward/walk-forward-scenarios.fixture.js';
import {
  buildDailyCandles,
  DAY_MILLISECONDS,
} from './fixtures/walk-forward/daily-candles.fixture.js';

const app = await loadWalkForwardApp();
const { createSearcher } = app.searcher;
const { createThreadedSearcher } = app.pool;
const { runWalkForward } = app.run;
const { WalkForwardRunError } = app.error;

const TIMEOUT_MILLISECONDS = 180_000;
const CRASHING_WORKER = new URL(
  './fixtures/walk-forward/crashing-search.worker.ts',
  import.meta.url,
).href;
const RUDE_WORKER = new URL('./fixtures/walk-forward/rude-search.worker.ts', import.meta.url).href;

async function digestWith(threads: number | undefined): Promise<string> {
  const scenario = buildWalkForwardScenario();
  const outcome = await runWalkForward(scenario.params({ threads }));
  expect(outcome.status).toBe('completed');
  return JSON.stringify(scenario.memory.snapshot());
}

function tinyInput(): SearchInput {
  const candles = buildDailyCandles({ count: 30, seed: 7, firstOpenTime: 0 });
  return {
    parameters: {
      schemaVersion: 1,
      symbol: 'BTCUSDT',
      timeframe: '1d',
      sentimentSource: 'fixture',
    },
    candles,
    sentiments: candles.map(() => null),
    trainSpans: [{ anchorIndex: 5, limitIndex: 20 }],
    strategies: [{ schemaVersion: 1 }],
  };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

describe('walk-forward: o resultado não depende do número de threads', () => {
  test(
    '1 thread × 4 threads × no próprio fio: o mesmo resultado gravado, byte a byte',
    async () => {
      const inline = await digestWith(undefined);
      const one = await digestWith(1);
      const four = await digestWith(4);
      expect(one).toBe(inline);
      expect(four).toBe(inline);
    },
    TIMEOUT_MILLISECONDS,
  );
});

describe('walk-forward: a thread de busca falha de forma tipada', () => {
  test('uma thread que morre derruba a busca com SEARCH_WORKER_FAILED', async () => {
    const searcher = createThreadedSearcher({
      input: tinyInput(),
      threads: 2,
      workerUrl: CRASHING_WORKER,
    });
    const error = await rejectionOf(searcher.evaluate(0));
    expect(error instanceof WalkForwardRunError && error.code).toBe('SEARCH_WORKER_FAILED');
    const later = await rejectionOf(searcher.evaluate(0));
    expect(later instanceof WalkForwardRunError && later.code).toBe('SEARCH_WORKER_FAILED');
    await searcher.close();
  });

  test('evento fora do esquema é falha, não resultado', async () => {
    const searcher = createThreadedSearcher({
      input: tinyInput(),
      threads: 1,
      workerUrl: RUDE_WORKER,
    });
    const error = await rejectionOf(searcher.evaluate(0));
    expect(error instanceof WalkForwardRunError && error.code).toBe('SEARCH_WORKER_FAILED');
    await searcher.close();
  });

  test('a thread de produção valida o contexto: estratégia inválida vira falha, sem texto do erro', async () => {
    const input = { ...tinyInput(), strategies: [{ schemaVersion: 99, secret: 'senha-secreta' }] };
    const searcher = createSearcher({ input, threads: 1 });
    const error = await rejectionOf(searcher.evaluate(0));
    expect(error instanceof WalkForwardRunError && error.code).toBe('SEARCH_WORKER_FAILED');
    expect(JSON.stringify(error instanceof Error ? error.message : '')).not.toContain(
      'senha-secreta',
    );
    await searcher.close();
  });

  test('a thread de produção calcula o resumo de uma combinação válida', async () => {
    const candles = buildDailyCandles({
      count: 200,
      seed: 11,
      firstOpenTime: 0,
    });
    const input: SearchInput = {
      ...tinyInput(),
      candles,
      sentiments: candles.map(() => null),
      trainSpans: [{ anchorIndex: 110, limitIndex: 190 }],
      strategies: [
        {
          schemaVersion: 1,
          rules: [{ id: 'ema-cross', kind: 'ema_cross', fastPeriod: 5, slowPeriod: 15 }],
          regime: { kind: 'none' },
          thresholds: { buy: '1', sell: '-1' },
          entry: { orderType: 'market' },
          risk: { atrPeriod: 14 },
        },
      ],
    };
    const local = createSearcher({ input, threads: undefined });
    const threaded = createSearcher({ input, threads: 2 });
    const expected = await local.evaluate(0);
    expect(await threaded.evaluate(0)).toEqual(expected);
    expect(expected).toHaveLength(1);
    expect(DAY_MILLISECONDS).toBe(86_400_000);
    await threaded.close();
  });
});
