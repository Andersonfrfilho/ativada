// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createWorkerLogger } from '../apps/worker-cryptoada/src/logging/worker-logger.js';
import { loadAlertsApi } from './fixtures/telegram/alerts-api.fixture.js';

const { createAlertScheduler } = await loadAlertsApi();
const POLL_MILLISECONDS = 15;
const SETTLE_MILLISECONDS = 120;
const SUMMARY = {
  claimed: 0,
  sent: 0,
  retried: 0,
  failed: 0,
  skipped: 0,
  errored: 0,
} as const;

type Controlled = {
  readonly dispatcher: { readonly tick: () => Promise<typeof SUMMARY> };
  readonly calls: { ticks: number; inFlight: number; maxInFlight: number };
  readonly gate: { promise: Promise<void>; open: () => void };
  failNext: boolean;
};

function createControlled(): Controlled {
  let open: () => void = () => undefined;
  const gate = { promise: Promise.resolve(), open: (): void => open() };
  gate.promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  const calls = { ticks: 0, inFlight: 0, maxInFlight: 0 };
  const controlled: Controlled = {
    calls,
    gate,
    failNext: false,
    dispatcher: {
      tick: async () => {
        calls.ticks += 1;
        calls.inFlight += 1;
        calls.maxInFlight = Math.max(calls.maxInFlight, calls.inFlight);
        await gate.promise;
        calls.inFlight -= 1;
        if (controlled.failNext) {
          controlled.failNext = false;
          throw new Error('segredo-xyz 123456789:FAKE_token');
        }
        return SUMMARY;
      },
    },
  };
  return controlled;
}

function build(controlled: Controlled): {
  readonly scheduler: ReturnType<typeof createAlertScheduler>;
  readonly lines: string[];
} {
  const lines: string[] = [];
  const logger = createWorkerLogger({
    appName: 'worker-test',
    write: (line) => void lines.push(line),
  });
  return {
    lines,
    scheduler: createAlertScheduler({
      dispatcher: controlled.dispatcher,
      logger,
      pollMilliseconds: POLL_MILLISECONDS,
    }),
  };
}

describe('agendador do despacho de alertas', () => {
  test('o intervalo dispara ciclos sozinho e, parado, não dispara mais', async () => {
    const controlled = createControlled();
    controlled.gate.open();
    const { scheduler } = build(controlled);
    scheduler.start();
    await Bun.sleep(SETTLE_MILLISECONDS);
    await scheduler.stop();
    const ticks = controlled.calls.ticks;
    expect(ticks).toBeGreaterThanOrEqual(3);
    await Bun.sleep(SETTLE_MILLISECONDS);
    expect(controlled.calls.ticks).toBe(ticks);
  });

  test('ciclos nunca se sobrepõem e os pedidos feitos durante um viram UM ciclo seguinte', async () => {
    const controlled = createControlled();
    const { scheduler } = build(controlled);
    scheduler.trigger();
    await Bun.sleep(5);
    for (let request = 0; request < 5; request += 1) scheduler.trigger();
    expect(controlled.calls.ticks).toBe(1);
    controlled.gate.open();
    await Bun.sleep(SETTLE_MILLISECONDS);
    await scheduler.stop();
    expect(controlled.calls.maxInFlight).toBe(1);
    expect(controlled.calls.ticks).toBe(2);
  });

  test('parar espera o ciclo no ar terminar', async () => {
    const controlled = createControlled();
    const { scheduler } = build(controlled);
    scheduler.trigger();
    await Bun.sleep(5);
    let isStopped = false;
    const stopping = scheduler.stop().then(() => {
      isStopped = true;
    });
    await Bun.sleep(SETTLE_MILLISECONDS);
    expect(isStopped).toBe(false);
    controlled.gate.open();
    await stopping;
    expect(isStopped).toBe(true);
  });

  test('depois de parado, pedido nenhum dispara ciclo', async () => {
    const controlled = createControlled();
    controlled.gate.open();
    const { scheduler } = build(controlled);
    await scheduler.stop();
    scheduler.trigger();
    await Bun.sleep(SETTLE_MILLISECONDS);
    expect(controlled.calls.ticks).toBe(0);
  });

  test('ciclo que falha vai ao log só com o nome do erro e o seguinte acontece', async () => {
    const controlled = createControlled();
    controlled.gate.open();
    controlled.failNext = true;
    const { scheduler, lines } = build(controlled);
    scheduler.start();
    await Bun.sleep(SETTLE_MILLISECONDS);
    await scheduler.stop();
    const text = lines.join('');
    expect(lines.filter((line) => line.includes('alert dispatch failed'))).toHaveLength(1);
    expect(text).not.toContain('segredo');
    expect(text).not.toContain('FAKE_token');
    expect(controlled.calls.ticks).toBeGreaterThanOrEqual(2);
  });
});
