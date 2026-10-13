// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { createInMemoryStallStore } from './fixtures/stall/in-memory-stall-store.fixture.js';
import type { InMemoryStallStore } from './fixtures/stall/in-memory-stall-store.fixture.js';

const { stallSweeper, stallSweepLoop } = await loadApiApp();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const GRACE = 15;
// 2026-10-13T10:00:00Z: a vela de 1 hora em curso quando a simulação foi criada.
const CREATED_CANDLE = Date.UTC(2026, 9, 13, 10);
const RUN = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9a01';
const OTHER_RUN = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9a02';
const OWNER = 'user-a';
// A primeira vela termina 11:00; com a carência o episódio nasce às 11:15.
const FIRST_STALL = CREATED_CANDLE + HOUR + 15 * MINUTE;

function openStore(): InMemoryStallStore {
  const store = createInMemoryStallStore();
  store.telegramUsers.add(OWNER);
  store.addRun({ runId: RUN, userId: OWNER, periodStart: CREATED_CANDLE });
  return store;
}

function sweep(
  store: InMemoryStallStore,
  now: number,
): ReturnType<typeof stallSweeper.sweepStalls> {
  return store.repository.inTransaction((session) =>
    stallSweeper.sweepStalls({ session, now, graceMinutes: GRACE }),
  );
}

function alertsOf(store: InMemoryStallStore, side: string): number {
  return store.alerts.filter((alert) => alert.side === side).length;
}

describe('varredura de parada: um episódio, um STALL e um RESUME', () => {
  test('na carência exata abre o episódio com o início determinístico; um instante antes não', async () => {
    const store = openStore();
    expect((await sweep(store, FIRST_STALL - 1)).opened).toBe(0);
    expect(store.runs.get(RUN)?.stalledSince).toBeUndefined();
    const summary = await sweep(store, FIRST_STALL);
    expect(summary).toStrictEqual({ isAcquired: true, opened: 1, closed: 0, cleared: 0 });
    expect(store.runs.get(RUN)?.stalledSince).toBe(FIRST_STALL);
    expect(store.alerts).toHaveLength(1);
    expect(store.alerts[0]).toMatchObject({ side: 'STALL', candleTime: FIRST_STALL, runId: RUN });
    expect(store.notifications).toStrictEqual([{ runId: RUN, stalledSince: FIRST_STALL }]);
  });

  test('o mesmo episódio atravessa horas, rondas repetidas e recuperação parcial sem novo STALL nem novo início', async () => {
    const store = openStore();
    await sweep(store, FIRST_STALL);
    await sweep(store, FIRST_STALL + MINUTE);
    await sweep(store, FIRST_STALL + 3 * HOUR);
    const run = store.runs.get(RUN);
    expect(run?.stalledSince).toBe(FIRST_STALL);
    // O worker volta e dá um passo, mas segue atrasado: continua o MESMO episódio.
    if (run !== undefined) run.lastCandleTime = CREATED_CANDLE;
    expect((await sweep(store, FIRST_STALL + 3 * HOUR)).opened).toBe(0);
    expect(run?.stalledSince).toBe(FIRST_STALL);
    expect(alertsOf(store, 'STALL')).toBe(1);
    expect(alertsOf(store, 'RESUME')).toBe(0);
    expect(store.notifications).toHaveLength(1);
  });

  test('ao alcançar, fecha com UM RESUME no início do episódio; repetir a ronda não duplica; episódio novo tem STALL novo', async () => {
    const store = openStore();
    await sweep(store, FIRST_STALL);
    const caughtUpAt = CREATED_CANDLE + 4 * HOUR;
    const run = store.runs.get(RUN);
    if (run !== undefined) run.lastCandleTime = CREATED_CANDLE + 2 * HOUR;
    const resumed = await sweep(store, caughtUpAt);
    expect(resumed).toStrictEqual({ isAcquired: true, opened: 0, closed: 1, cleared: 0 });
    expect(run?.stalledSince).toBeUndefined();
    const resume = store.alerts.find((alert) => alert.side === 'RESUME');
    expect(resume).toMatchObject({ candleTime: FIRST_STALL, runId: RUN });
    expect(resume?.payload).toStrictEqual({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      stalledSince: FIRST_STALL,
      resumedAt: caughtUpAt,
    });
    await sweep(store, caughtUpAt + MINUTE);
    expect(alertsOf(store, 'RESUME')).toBe(1);
    expect(alertsOf(store, 'STALL')).toBe(1);
    // O worker some de novo: a vela devida é outra, o início é novo e o STALL também.
    const secondEpisode = CREATED_CANDLE + 4 * HOUR + 15 * MINUTE;
    await sweep(store, secondEpisode + 2 * HOUR);
    expect(run?.stalledSince).toBe(secondEpisode);
    expect(alertsOf(store, 'STALL')).toBe(2);
  });

  test('duas instâncias ao mesmo tempo: só uma pega a trava e nada é duplicado', async () => {
    const store = openStore();
    const [first, second] = await Promise.all([
      sweep(store, FIRST_STALL),
      sweep(store, FIRST_STALL),
    ]);
    expect([first.isAcquired, second.isAcquired].sort()).toStrictEqual([false, true]);
    expect(store.lockAttempts.count).toBe(2);
    expect(store.alerts).toHaveLength(1);
    expect(store.notifications).toHaveLength(1);
    const loser = first.isAcquired ? second : first;
    expect(loser).toStrictEqual({ isAcquired: false, opened: 0, closed: 0, cleared: 0 });
  });
});

describe('o que não é parada', () => {
  test('espera por dado não abre episódio e não encerra um aberto', async () => {
    const store = openStore();
    const run = store.runs.get(RUN);
    if (run !== undefined) run.isWaitingForData = true;
    expect((await sweep(store, FIRST_STALL + 5 * HOUR)).opened).toBe(0);
    expect(store.alerts).toHaveLength(0);
    if (run !== undefined) {
      run.isWaitingForData = false;
      await sweep(store, FIRST_STALL);
      run.isWaitingForData = true;
    }
    expect((await sweep(store, FIRST_STALL + 5 * HOUR)).closed).toBe(0);
    expect(run?.stalledSince).toBe(FIRST_STALL);
    expect(alertsOf(store, 'RESUME')).toBe(0);
  });

  test('execução que deixou de rodar com episódio aberto só perde a marca: sem RESUME e sem aviso', async () => {
    const store = openStore();
    await sweep(store, FIRST_STALL);
    const notified = store.notifications.length;
    const run = store.runs.get(RUN);
    if (run !== undefined) run.status = 'cancelled';
    const summary = await sweep(store, FIRST_STALL + HOUR);
    expect(summary.cleared).toBe(1);
    expect(run?.stalledSince).toBeUndefined();
    expect(alertsOf(store, 'RESUME')).toBe(0);
    expect(store.notifications).toHaveLength(notified);
  });

  test('vela desconhecida na linha é ignorada, sem derrubar a ronda das outras', async () => {
    const store = openStore();
    store.addRun({ runId: OTHER_RUN, userId: OWNER, timeframe: '7m', periodStart: CREATED_CANDLE });
    const summary = await sweep(store, FIRST_STALL);
    expect(summary.opened).toBe(1);
    expect(store.runs.get(OTHER_RUN)?.stalledSince).toBeUndefined();
  });
});

describe('alerta de parada: quem recebe e o que leva', () => {
  test('dono sem Telegram ligado tem a faixa (stalledSince e aviso ao painel), mas nenhum alerta', async () => {
    const store = openStore();
    store.telegramUsers.clear();
    await sweep(store, FIRST_STALL);
    expect(store.runs.get(RUN)?.stalledSince).toBe(FIRST_STALL);
    expect(store.notifications).toHaveLength(1);
    expect(store.alerts).toHaveLength(0);
  });

  test('RESUME só nasce atrás de um STALL: Telegram ligado no meio do episódio não manda "voltou" sozinho', async () => {
    const store = openStore();
    store.telegramUsers.clear();
    await sweep(store, FIRST_STALL);
    store.telegramUsers.add(OWNER);
    const run = store.runs.get(RUN);
    if (run !== undefined) run.lastCandleTime = CREATED_CANDLE + 2 * HOUR;
    const summary = await sweep(store, CREATED_CANDLE + 4 * HOUR);
    expect(summary.closed).toBe(1);
    expect(store.alerts).toHaveLength(0);
  });

  test('o conteúdo leva só o par, a vela e os horários: nada do dono, da execução nem da estratégia', async () => {
    const store = openStore();
    await sweep(store, FIRST_STALL);
    const run = store.runs.get(RUN);
    if (run !== undefined) run.lastCandleTime = CREATED_CANDLE + 2 * HOUR;
    await sweep(store, CREATED_CANDLE + 4 * HOUR);
    const [stall, resume] = store.alerts;
    expect(Object.keys(stall?.payload ?? {}).sort()).toStrictEqual([
      'stalledSince',
      'symbol',
      'timeframe',
    ]);
    expect(Object.keys(resume?.payload ?? {}).sort()).toStrictEqual([
      'resumedAt',
      'stalledSince',
      'symbol',
      'timeframe',
    ]);
    const text = JSON.stringify(store.alerts.map((alert) => alert.payload));
    expect(text).not.toContain(OWNER);
    expect(text).not.toContain(RUN);
  });
});

describe('laço da varredura', () => {
  type StallLoop = ReturnType<typeof stallSweepLoop.createStallSweepLoop>;
  type Line = { readonly message: string; readonly fields: Record<string, unknown> | undefined };

  function openLoop(
    store: InMemoryStallStore,
    health: { isWaiting: boolean },
  ): { loop: StallLoop; lines: Line[] } {
    const lines: Line[] = [];
    const timers = { every: () => (): void => undefined };
    const record = (message: string, fields?: Record<string, unknown>): void => {
      lines.push({ message, fields });
    };
    const loop = stallSweepLoop.createStallSweepLoop({
      store: store.repository,
      timers,
      logger: { debug: record, info: record, warn: record, error: record },
      outage: {
        isWaiting: () => health.isWaiting,
        handleFailure: () => false,
        handleSuccess: () => undefined,
      },
      now: () => FIRST_STALL,
      graceMinutes: GRACE,
      intervalMilliseconds: 60_000,
    });
    return { loop, lines };
  }

  test('uma ronda que muda algo loga só as contagens; a seguinte, sem mudança, não loga', async () => {
    const store = openStore();
    const { loop, lines } = openLoop(store, { isWaiting: false });
    await loop.runOnce();
    await loop.runOnce();
    expect(lines).toStrictEqual([
      { message: stallSweepLoop.STALL_SWEEP_LOG.CHANGED, fields: { opened: 1, closed: 0 } },
    ]);
  });

  test('banco em espera: a ronda nem toca o repositório', async () => {
    const store = openStore();
    const { loop } = openLoop(store, { isWaiting: true });
    await loop.runOnce();
    expect(store.lockAttempts.count).toBe(0);
  });

  test('erro da ronda não escapa e loga só o nome', async () => {
    const lines: Line[] = [];
    class BoomError extends Error {}
    const failing = {
      inTransaction: (): Promise<never> =>
        Promise.reject(new BoomError('postgres://usuario:segredo@host/db')),
    };
    const failingLoop = stallSweepLoop.createStallSweepLoop({
      store: failing,
      timers: { every: () => (): void => undefined },
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: (message, fields): void => void lines.push({ message, fields }),
      },
      outage: {
        isWaiting: () => false,
        handleFailure: () => false,
        handleSuccess: () => undefined,
      },
      now: () => FIRST_STALL,
      graceMinutes: GRACE,
      intervalMilliseconds: 60_000,
    });
    await failingLoop.runOnce();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.message).toBe(stallSweepLoop.STALL_SWEEP_LOG.FAILED);
    expect(JSON.stringify(lines)).not.toContain('segredo');
  });
});
