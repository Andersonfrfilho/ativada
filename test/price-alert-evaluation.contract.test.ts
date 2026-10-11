// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { FireDueAlertsParams } from '../packages/database/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { createFakeSocket, USER_A, USER_B } from './fixtures/stream/fake-stream-socket.fixture.js';
import { loadStreamApp } from './fixtures/stream/stream-app.fixture.js';

const app = await loadApiApp();
const { hub: hubModule } = await loadStreamApp();

const NOW = 1_760_000_000_000;
const STALE_AFTER = 10_000;
const MINIMUM_REFIRE = 300_000;
const ALERT_OF_A = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9a01';
const ALERT_OF_B = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9b02';
const UNKNOWN_ALERT = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9c03';

type Tick = { symbol: string; price: string; change24h: string | undefined; eventTime: number };

function tick(overrides: Partial<Tick> = {}): Tick {
  return {
    symbol: 'BTCUSDT',
    price: '70001.25000000',
    change24h: '1.5',
    eventTime: NOW,
    ...overrides,
  };
}

function openEvaluator(): { onTick: (tick: Tick) => unknown; calls: FireDueAlertsParams[] } {
  const calls: FireDueAlertsParams[] = [];
  const listener = app.priceAlertEvaluator.createPriceAlertEvaluator({
    repository: {
      fireDueAlerts: (params) => {
        calls.push(params);
        return Promise.resolve({ firedAlertIds: [] });
      },
    },
    now: () => NOW,
    staleAfterMilliseconds: STALE_AFTER,
    minimumRefireMilliseconds: MINIMUM_REFIRE,
  });
  return { onTick: listener.onTick, calls };
}

describe('avaliador do alerta de preço: cada tick agregado vai ao banco, o dado velho não', () => {
  test('um tick fresco chama o disparo com o par, o preço em texto e o instante dele', async () => {
    const { onTick, calls } = openEvaluator();
    await onTick(tick({ eventTime: NOW - 1_234 }));
    expect(calls).toStrictEqual([
      {
        symbol: 'BTCUSDT',
        price: '70001.25000000',
        eventTime: NOW - 1_234,
        minimumRefireMilliseconds: MINIMUM_REFIRE,
      },
    ]);
  });

  test('cada tick é uma avaliação: o banco é quem garante que o alerta dispara uma vez', async () => {
    const { onTick, calls } = openEvaluator();
    await onTick(tick({ eventTime: NOW - 2_000 }));
    await onTick(tick({ eventTime: NOW - 1_000 }));
    await onTick(tick({ symbol: 'ETHUSDT', price: '3500' }));
    expect(calls.map((call) => call.symbol)).toStrictEqual(['BTCUSDT', 'BTCUSDT', 'ETHUSDT']);
  });

  test('tick mais velho que o limite não avalia nada; no limite exato ainda avalia', async () => {
    const { onTick, calls } = openEvaluator();
    await onTick(tick({ eventTime: NOW - STALE_AFTER - 1 }));
    expect(calls).toStrictEqual([]);
    await onTick(tick({ eventTime: NOW - STALE_AFTER }));
    expect(calls).toHaveLength(1);
  });

  test('o relógio do evento à frente do nosso (desvio pequeno) não é dado velho', async () => {
    const { onTick, calls } = openEvaluator();
    await onTick(tick({ eventTime: NOW + 500 }));
    expect(calls).toHaveLength(1);
  });

  test('falha do banco sobe ao publicador (que a reporta): o tick seguinte não é afetado', async () => {
    const listener = app.priceAlertEvaluator.createPriceAlertEvaluator({
      repository: { fireDueAlerts: () => Promise.reject(new Error('banco fora')) },
      now: () => NOW,
      staleAfterMilliseconds: STALE_AFTER,
      minimumRefireMilliseconds: MINIMUM_REFIRE,
    });
    const failure = await Promise.resolve(listener.onTick(tick())).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('banco fora');
  });
});

function openDispatcher(): {
  socketOfA: ReturnType<typeof createFakeSocket>;
  socketOfB: ReturnType<typeof createFakeSocket>;
  errors: unknown[];
  dispatch: (alertId: string) => Promise<void>;
} {
  const hub = hubModule.createStreamHub({ maxSocketsPerUser: 5 });
  const socketOfA = createFakeSocket();
  const socketOfB = createFakeSocket({ userId: USER_B });
  hub.add(socketOfA);
  hub.add(socketOfB);
  const errors: unknown[] = [];
  const owners = new Map<string, string>([
    [ALERT_OF_A, USER_A],
    [ALERT_OF_B, USER_B],
  ]);
  const dispatcher = app.priceAlertEventDispatcher.createPriceAlertEventDispatcher({
    hub,
    now: () => NOW,
    reportError: (error) => void errors.push(error),
    resolveOwner: (alertId) => {
      if (alertId === 'quebra') return Promise.reject(new Error('banco fora'));
      return Promise.resolve(owners.get(alertId));
    },
  });
  return {
    socketOfA,
    socketOfB,
    errors,
    dispatch: (alertId) => dispatcher.dispatch({ kind: 'price_alert', alertId }),
  };
}

describe('aviso do disparo ao painel: o dono vem do banco, a entrega é só a ele', () => {
  test('o disparo do alerta de A chega só aos sockets de A, com o ponteiro e a hora', async () => {
    const { socketOfA, socketOfB, dispatch } = openDispatcher();
    await dispatch(ALERT_OF_A);
    expect(socketOfB.sent).toStrictEqual([]);
    expect(JSON.parse(socketOfA.sent[0] ?? '{}')).toStrictEqual({
      type: 'price_alert',
      alertId: ALERT_OF_A,
      at: NOW,
    });
    expect(socketOfA.sent[0]).not.toContain(USER_A);
  });

  test('o disparo do alerta de B chega só a B', async () => {
    const { socketOfA, socketOfB, dispatch } = openDispatcher();
    await dispatch(ALERT_OF_B);
    expect(socketOfA.sent).toStrictEqual([]);
    expect(socketOfB.sent).toHaveLength(1);
  });

  test('alerta sem dono ativo (apagado, conta bloqueada ou apagada) não chega a ninguém', async () => {
    const { socketOfA, socketOfB, dispatch } = openDispatcher();
    await dispatch(UNKNOWN_ALERT);
    expect(socketOfA.sent).toStrictEqual([]);
    expect(socketOfB.sent).toStrictEqual([]);
  });

  test('falha ao resolver o dono é reportada e não sobe', async () => {
    const { errors, socketOfA, dispatch } = openDispatcher();
    await dispatch('quebra');
    expect(errors).toHaveLength(1);
    expect(socketOfA.sent).toStrictEqual([]);
  });
});
