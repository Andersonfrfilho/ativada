// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { createRecoveryClock } from '../apps/worker-ativada/src/stream/recovery-clock.js';
import {
  PIPELINE_BASE,
  PIPELINE_HOUR,
  startPipeline,
  stopPipeline,
  type Pipeline,
} from './fixtures/worker-pipeline.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

let pipeline: Pipeline | undefined;

afterEach(async () => {
  if (pipeline !== undefined) await stopPipeline(pipeline);
  pipeline = undefined;
});

describe('relógio das recuperações de lacunas', () => {
  test('começa em 0 e guarda o instante da última recuperação limpa', () => {
    let now = 1_000;
    const clock = createRecoveryClock(() => now);
    expect(clock.lastCleanRoundAt()).toBe(0);
    clock.markCleanRound();
    expect(clock.lastCleanRoundAt()).toBe(1_000);
    now = 5_000;
    clock.markCleanRound();
    expect(clock.lastCleanRoundAt()).toBe(5_000);
  });

  test('o worker anota só a recuperação que termina sem erro: a banida não conta, a que repete e termina conta uma vez', async () => {
    let marks = 0;
    pipeline = startPipeline({
      seedOpenTime: PIPELINE_BASE - 3 * PIPELINE_HOUR,
      recoveryClock: { markCleanRound: () => void (marks += 1) },
    });
    pipeline.server.banRest({ requests: 1, retryAfterSeconds: 30 });
    const openTimes = [-3, -2, -1].map((hours) => PIPELINE_BASE + hours * PIPELINE_HOUR);
    pipeline.server.setHistory({ symbol: 'BTCUSDT', timeframe: '1h', openTimes });
    await waitFor(
      () => pipeline?.finishedRecoveries() === 1,
      'recuperação terminada depois do ban',
    );
    expect(marks).toBe(1);
  });
});
