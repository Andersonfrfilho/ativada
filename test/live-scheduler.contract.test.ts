// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { LiveEvaluator } from '../apps/worker-cryptoada/src/live/live-run.types.js';
import { buildUnfillableKey } from '../apps/worker-cryptoada/src/stream/gap-recovery.js';
import { createGapConfirmation } from '../apps/worker-cryptoada/src/live/gap-confirmation.js';
import { loadLiveApi } from './fixtures/live/live-api.fixture.js';
import { createTestLogger } from './fixtures/live/live-scenarios.fixture.js';

const POLL_MILLISECONDS = 15;
const SETTLE_MILLISECONDS = 120;
const SUMMARY = { claimed: 0, evaluated: 0, steps: 0, ended: 0, failed: 0 } as const;

type ControlledEvaluator = LiveEvaluator & {
  readonly calls: { ticks: number; releases: number; inFlight: number; maxInFlight: number };
  readonly gate: { promise: Promise<void>; open: () => void };
  failNext: boolean;
};

function createControlledEvaluator(): ControlledEvaluator {
  let open: () => void = () => undefined;
  const gate = {
    promise: Promise.resolve(),
    open: (): void => open(),
  };
  const calls = { ticks: 0, releases: 0, inFlight: 0, maxInFlight: 0 };
  const evaluator: ControlledEvaluator = {
    calls,
    gate,
    failNext: false,
    tick: async () => {
      calls.ticks += 1;
      calls.inFlight += 1;
      calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight);
      await evaluator.gate.promise;
      calls.inFlight -= 1;
      if (evaluator.failNext) {
        evaluator.failNext = false;
        throw new Error('segredo-xyz');
      }
      return SUMMARY;
    },
    release: () => {
      calls.releases += 1;
      return Promise.resolve(1);
    },
  };
  gate.promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return evaluator;
}

async function buildScheduler(evaluator: LiveEvaluator): Promise<{
  readonly scheduler: ReturnType<Awaited<ReturnType<typeof loadLiveApi>>['createLiveScheduler']>;
  readonly logger: ReturnType<typeof createTestLogger>;
}> {
  const { createLiveScheduler } = await loadLiveApi();
  const logger = createTestLogger();
  return {
    logger,
    scheduler: createLiveScheduler({ evaluator, logger, pollMilliseconds: POLL_MILLISECONDS }),
  };
}

describe('agendador da avaliação ao vivo', () => {
  test('o intervalo dispara rondas sozinho e parar devolve a simulação à fila uma vez', async () => {
    const evaluator = createControlledEvaluator();
    evaluator.gate.open();
    const { scheduler } = await buildScheduler(evaluator);
    scheduler.start();
    await Bun.sleep(SETTLE_MILLISECONDS);
    await scheduler.stop();
    const ticks = evaluator.calls.ticks;
    expect(ticks).toBeGreaterThanOrEqual(3);
    expect(evaluator.calls.releases).toBe(1);
    await Bun.sleep(SETTLE_MILLISECONDS);
    expect(evaluator.calls.ticks).toBe(ticks);
  });

  test('rondas nunca se sobrepõem e os pedidos feitos durante uma viram UMA ronda seguinte', async () => {
    const evaluator = createControlledEvaluator();
    const { scheduler } = await buildScheduler(evaluator);
    scheduler.trigger();
    await Bun.sleep(5);
    for (let request = 0; request < 5; request += 1) scheduler.trigger();
    expect(evaluator.calls.ticks).toBe(1);
    evaluator.gate.open();
    await Bun.sleep(SETTLE_MILLISECONDS);
    await scheduler.stop();
    expect(evaluator.calls.maxInFlight).toBe(1);
    expect(evaluator.calls.ticks).toBe(2);
  });

  test('parar espera a ronda no ar terminar antes de devolver à fila', async () => {
    const evaluator = createControlledEvaluator();
    const { scheduler } = await buildScheduler(evaluator);
    scheduler.trigger();
    await Bun.sleep(5);
    let isStopped = false;
    const stopping = scheduler.stop().then(() => {
      isStopped = true;
    });
    await Bun.sleep(SETTLE_MILLISECONDS);
    expect(isStopped).toBe(false);
    expect(evaluator.calls.releases).toBe(0);
    evaluator.gate.open();
    await stopping;
    expect(evaluator.calls.releases).toBe(1);
  });

  test('depois de parado, pedido nenhum dispara ronda', async () => {
    const evaluator = createControlledEvaluator();
    evaluator.gate.open();
    const { scheduler } = await buildScheduler(evaluator);
    await scheduler.stop();
    scheduler.trigger();
    await Bun.sleep(SETTLE_MILLISECONDS);
    expect(evaluator.calls.ticks).toBe(0);
  });

  test('ronda que falha vai ao log só com o nome do erro e a seguinte acontece', async () => {
    const evaluator = createControlledEvaluator();
    evaluator.gate.open();
    evaluator.failNext = true;
    const { scheduler, logger } = await buildScheduler(evaluator);
    scheduler.start();
    await Bun.sleep(SETTLE_MILLISECONDS);
    await scheduler.stop();
    expect(logger.entries.filter((entry) => entry.message === 'live tick failed')).toHaveLength(1);
    expect(JSON.stringify(logger.entries)).not.toContain('segredo');
    expect(evaluator.calls.ticks).toBeGreaterThanOrEqual(2);
  });
});

describe('lacuna confirmada: só o que a recuperação marcou como inalcançável', () => {
  const pair = { symbol: 'BTCUSDT', timeframe: '1h' } as const;
  const HOUR = 3_600_000;

  test('todas as aberturas do buraco precisam estar marcadas', () => {
    const unfillable = new Set([
      buildUnfillableKey(pair, 1 * HOUR),
      buildUnfillableKey(pair, 2 * HOUR),
    ]);
    const isConfirmed = createGapConfirmation(unfillable);
    expect(isConfirmed({ ...pair, openTimes: [1 * HOUR, 2 * HOUR] })).toBe(true);
    expect(isConfirmed({ ...pair, openTimes: [1 * HOUR, 2 * HOUR, 3 * HOUR] })).toBe(false);
    expect(isConfirmed({ ...pair, openTimes: [3 * HOUR] })).toBe(false);
  });

  test('a marca é do par e do timeframe: o mesmo instante em outro mercado não vale', () => {
    const unfillable = new Set([buildUnfillableKey(pair, 1 * HOUR)]);
    const isConfirmed = createGapConfirmation(unfillable);
    expect(isConfirmed({ symbol: 'ETHUSDT', timeframe: '1h', openTimes: [1 * HOUR] })).toBe(false);
    expect(isConfirmed({ symbol: 'BTCUSDT', timeframe: '4h', openTimes: [1 * HOUR] })).toBe(false);
  });

  test('a marca acompanha o conjunto vivo da recuperação: o que ela marcar depois passa a valer', () => {
    const unfillable = new Set<string>();
    const isConfirmed = createGapConfirmation(unfillable);
    expect(isConfirmed({ ...pair, openTimes: [HOUR] })).toBe(false);
    unfillable.add(buildUnfillableKey(pair, HOUR));
    expect(isConfirmed({ ...pair, openTimes: [HOUR] })).toBe(true);
  });
});
