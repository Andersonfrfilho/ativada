// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  BASE_DELAY,
  createStreamHarness,
  FIRST_OPEN_TIME,
  type StreamHarness,
} from './fixtures/kline-stream-harness.fixture.js';
import { createManualClock, createRecordingSleep, waitFor } from './fixtures/wait-for.fixture.js';

const STALE_MILLISECONDS = 1_000;
const ABSENCE_WINDOW_MILLISECONDS = 250;

let harness: StreamHarness;

beforeEach(() => {
  harness = createStreamHarness();
});

afterEach(async () => {
  await harness.closeAll();
});

describe('kline stream: reconnection', () => {
  test('backs off exponentially up to the cap, with the jittered delay of the injected random', async () => {
    harness.server.refuseConnections(true);
    const recorder = createRecordingSleep();
    const opened = harness.open({ sleep: recorder.sleep });
    await waitFor(() => recorder.delays.length >= 5, 'five failed attempts');
    expect(recorder.delays.slice(0, 5)).toStrictEqual([75, 150, 300, 300, 300]);
    harness.server.refuseConnections(false);
    await waitFor(() => opened.attempts.length === 1, 'connection after the server comes back');
    expect(opened.attempts[0]).toBeGreaterThanOrEqual(6);
  });

  test('jitter spreads the delay between half and the full capped value', async () => {
    harness.server.refuseConnections(true);
    const recorder = createRecordingSleep();
    const randoms = [0, 1, 0];
    let index = 0;
    harness.open({ sleep: recorder.sleep, random: () => randoms[index++ % randoms.length] ?? 0 });
    await waitFor(() => recorder.delays.length >= 3, 'three failed attempts');
    expect(recorder.delays.slice(0, 3)).toStrictEqual([50, 200, 200]);
  });

  test('never reconnects in a tight loop: every wait is at least half of the base delay', async () => {
    harness.server.refuseConnections(true);
    const recorder = createRecordingSleep();
    const opened = harness.open({ sleep: recorder.sleep, random: () => 0 });
    await waitFor(() => recorder.delays.length >= 8, 'eight failed attempts');
    expect(recorder.delays.every((delay) => delay >= BASE_DELAY / 2)).toBe(true);
    expect(opened.stream.stats().attemptCount).toBeLessThanOrEqual(recorder.delays.length + 1);
  });

  test('resets the backoff only after a stable connection', async () => {
    harness.server.refuseConnections(true);
    const recorder = createRecordingSleep();
    const clock = createManualClock(FIRST_OPEN_TIME);
    const opened = harness.open({
      sleep: recorder.sleep,
      now: clock.now,
      stableAfterMilliseconds: 1_000,
    });
    await waitFor(() => recorder.delays.length >= 3, 'three failed attempts');
    harness.server.refuseConnections(false);
    await waitFor(() => opened.attempts.length === 1, 'stable connection');
    const waitsBeforeDrop = recorder.delays.length;
    clock.advance(2_000);
    harness.server.dropConnections();
    await waitFor(() => opened.attempts.length === 2, 'second connection');
    harness.server.dropConnections();
    await waitFor(() => recorder.delays.length >= waitsBeforeDrop + 2, 'two more waits');
    expect(recorder.delays.slice(0, 3)).toStrictEqual([75, 150, 300]);
    expect(recorder.delays.slice(waitsBeforeDrop, waitsBeforeDrop + 2)).toStrictEqual([75, 150]);
  });

  test('treats a server-side disconnection (the forced 24 h one) as a normal drop and resumes delivery', async () => {
    const recorder = createRecordingSleep();
    const opened = harness.open({ sleep: recorder.sleep });
    await waitFor(() => opened.attempts.length === 1, 'first connection');
    harness.server.dropConnections();
    await waitFor(() => opened.attempts.length === 2, 'reconnection');
    expect(opened.disconnections).toStrictEqual(['server-closed']);
    harness.sendClosed(FIRST_OPEN_TIME);
    await waitFor(() => opened.candles.length === 1, 'candle after reconnection');
  });

  test('reconnects when no message arrives for staleAfterMilliseconds', async () => {
    const opened = harness.open({ staleAfterMilliseconds: 150 });
    await waitFor(() => opened.disconnections.includes('stale'), 'silence detected', 2_000);
    await waitFor(() => opened.attempts.length >= 2, 'reconnection after silence', 2_000);
    expect(harness.server.connectionCount()).toBeGreaterThanOrEqual(2);
  });

  test('keeps the connection while messages keep arriving', async () => {
    const opened = harness.open({ staleAfterMilliseconds: STALE_MILLISECONDS });
    await waitFor(() => opened.attempts.length === 1, 'first connection');
    for (let tick = 0; tick < 8; tick += 1) {
      harness.server.sendEvent({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        openTime: FIRST_OPEN_TIME,
        isClosed: false,
      });
      await Bun.sleep(STALE_MILLISECONDS / 10);
    }
    expect(opened.disconnections).toStrictEqual([]);
    expect(harness.server.connectionCount()).toBe(1);
  });

  test('close() during the backoff is idempotent and stops reconnecting for good', async () => {
    harness.server.refuseConnections(true);
    const parked: number[] = [];
    const opened = harness.open({
      sleep: (milliseconds) => {
        parked.push(milliseconds);
        return new Promise<void>(() => undefined);
      },
    });
    await waitFor(() => parked.length === 1, 'first attempt over, parked in the backoff');
    await opened.stream.close();
    await opened.stream.close();
    const attemptsAtClose = opened.stream.stats().attemptCount;
    harness.server.refuseConnections(false);
    // Janela de ausência: só reprova se algo reconectar; esperar mais não torna o teste instável.
    await Bun.sleep(ABSENCE_WINDOW_MILLISECONDS);
    expect(harness.server.connectionCount()).toBe(0);
    expect(opened.stream.stats().attemptCount).toBe(attemptsAtClose);
  });

  test('close() resolves only after the reconnect loop ended, even when the backoff sleep never returns', async () => {
    harness.server.refuseConnections(true);
    const sleeping: number[] = [];
    const opened = harness.open({
      sleep: (milliseconds) => {
        sleeping.push(milliseconds);
        return new Promise<void>(() => undefined);
      },
    });
    await waitFor(() => sleeping.length === 1, 'first failed attempt, now in the backoff');
    const outcome = await Promise.race([
      opened.stream.close().then(() => 'closed'),
      Bun.sleep(1_000).then(() => 'hung'),
    ]);
    expect(outcome).toBe('closed');
    expect(opened.stream.stats().attemptCount).toBe(1);
  });

  test('close() cancels the backoff timers of its own sleep', async () => {
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    const longTimers = new Set<unknown>();
    const patched = ((handler: () => void, milliseconds?: number): unknown => {
      const timer = realSetTimeout(handler, milliseconds);
      if ((milliseconds ?? 0) >= 30_000) longTimers.add(timer);
      return timer;
    }) as unknown as typeof setTimeout;
    const patchedClear = ((timer: Parameters<typeof clearTimeout>[0]): void => {
      longTimers.delete(timer);
      realClearTimeout(timer);
    }) as typeof clearTimeout;
    globalThis.setTimeout = patched;
    globalThis.clearTimeout = patchedClear;
    try {
      harness.server.refuseConnections(true);
      const opened = harness.open({
        reconnectBaseMilliseconds: 60_000,
        reconnectMaxMilliseconds: 120_000,
      });
      await waitFor(
        () => harness.server.connectionCount() === 0 && longTimers.size >= 1,
        'in the backoff',
      );
      await opened.stream.close();
      expect(longTimers.size).toBe(0);
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    }
  });

  test('a rejection inside the reconnect loop is counted and the stream goes on, with no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown): void => void unhandled.push(reason);
    process.on('unhandledRejection', listener);
    try {
      harness.server.refuseConnections(true);
      let calls = 0;
      const opened = harness.open({
        reconnectMaxMilliseconds: 40,
        sleep: () => {
          calls += 1;
          return calls === 1 ? Promise.reject(new Error('sleep quebrado')) : Bun.sleep(1);
        },
      });
      await waitFor(() => opened.stream.stats().attemptCount >= 3, 'attempts after the failure');
      await Bun.sleep(20);
      expect(opened.stream.stats().loopFailureCount).toBe(1);
      expect(unhandled).toStrictEqual([]);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });
});
