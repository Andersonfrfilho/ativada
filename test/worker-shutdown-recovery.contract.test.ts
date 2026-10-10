// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { createWorkerLogger } from '../apps/worker-cryptoada/src/logging/worker-logger.js';
import { createCandleWriter } from '../apps/worker-cryptoada/src/stream/candle-writer.js';
import { recoverGaps } from '../apps/worker-cryptoada/src/stream/gap-recovery.js';
import { buildGridCandle } from './fixtures/backfill-harness.fixture.js';
import { createInMemoryCandleRepository } from './fixtures/in-memory-candle-repository.fixture.js';
import {
  PIPELINE_BASE,
  PIPELINE_HOUR,
  startPipeline,
  stopPipeline,
  type Pipeline,
} from './fixtures/worker-pipeline.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const SHUTDOWN_BUDGET_MILLISECONDS = 3_000;
const PROMPT_MILLISECONDS = 1_000;

let pipeline: Pipeline | undefined;

afterEach(async () => {
  if (pipeline !== undefined) await stopPipeline(pipeline);
  pipeline = undefined;
});

const quietLogger = createWorkerLogger({ appName: 'worker-cryptoada', write: () => undefined });

describe('worker: shutdown while the gap recovery is running', () => {
  test('stop() with a REST call stuck in flight ends in under 3 s', async () => {
    pipeline = startPipeline({ seedOpenTime: PIPELINE_BASE - 3 * PIPELINE_HOUR });
    pipeline.server.setHistory({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTimes: [-2, -1].map((hours) => PIPELINE_BASE + hours * PIPELINE_HOUR),
    });
    pipeline.server.holdRest();
    await waitFor(() => pipeline?.server.restRequests.length === 1, 'recovery waiting on REST');
    const startedAt = Date.now();
    await pipeline.worker.stop();
    expect(Date.now() - startedAt).toBeLessThan(SHUTDOWN_BUDGET_MILLISECONDS);
  });
});

describe('worker: the recovery checks for the stop between pairs', () => {
  test('after the stop, the next pair is not requested', async () => {
    const now = PIPELINE_BASE + PIPELINE_HOUR / 2;
    const controller = new AbortController();
    const requested: string[] = [];
    const seed = ['AAAUSDT', 'BBBUSDT'].map((symbol) =>
      buildGridCandle({ symbol, timeframe: '1h', openTime: PIPELINE_BASE - 3 * PIPELINE_HOUR }),
    );
    const outcome = await recoverGaps({
      repository: createInMemoryCandleRepository({ now: () => now, seed }),
      client: {
        fetchKlinesRange: (params) => {
          requested.push(params.symbol);
          controller.abort();
          return Promise.resolve([]);
        },
      },
      logger: quietLogger,
      now: () => now,
      refreshClock: () => Promise.resolve(),
      exchange: 'binance',
      symbols: ['AAAUSDT', 'BBBUSDT'],
      timeframes: ['1h'],
      lookbackMilliseconds: 4 * PIPELINE_HOUR,
      unfillable: new Set<string>(),
      signal: controller.signal,
    });
    expect(requested).toStrictEqual(['AAAUSDT']);
    expect(outcome.failures).toBe(0);
  });
});

describe('worker: a candle write retrying while the process stops', () => {
  test('the pending backoff does not hold the drain and no new attempt is made', async () => {
    const controller = new AbortController();
    let attempts = 0;
    let exhausted = 0;
    const writer = createCandleWriter({
      repository: {
        upsertCandles: () => {
          attempts += 1;
          return Promise.reject(new Error('banco fora'));
        },
      },
      logger: quietLogger,
      exchange: 'binance',
      sleep: () => new Promise<void>(() => undefined),
      onWriteExhausted: () => void (exhausted += 1),
      signal: controller.signal,
    });
    void writer.write(
      buildGridCandle({ symbol: 'BTCUSDT', timeframe: '1h', openTime: PIPELINE_BASE }),
    );
    await waitFor(() => attempts === 1, 'first attempt failed');
    controller.abort();
    const outcome = await Promise.race([
      writer.drain().then(() => 'drained'),
      Bun.sleep(PROMPT_MILLISECONDS).then(() => 'hung'),
    ]);
    expect(outcome).toBe('drained');
    expect(attempts).toBe(1);
    expect(exhausted).toBe(0);
  });
});
