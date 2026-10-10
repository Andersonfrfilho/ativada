// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { RunRecord } from '../packages/database/src/index.js';
import type { GoalDecision, GoalTracking } from '../apps/worker-cryptoada/src/live/goal-step.js';
import {
  createEngine,
  type EngineCandle,
  type EquityPointDecision,
} from '../packages/strategy-engine/src/index.js';
import { loadLiveGoalParts } from './fixtures/live/live-api.fixture.js';
import { buildReferenceRun } from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import { CLASSIC_STRATEGY } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

const parts = await loadLiveGoalParts();
const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 10);
const SETUP = buildReferenceRun({ symbol: 'BTCUSDT', timeframe: '1h' });

function runWith(request: unknown, goalId: string | undefined = 'goal-1'): RunRecord {
  return {
    id: 'run-1',
    kind: 'live_paper',
    periodStart: START,
    request,
    goalId,
  } as unknown as RunRecord;
}

const GOAL = { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 3 };

function trackingOf(overrides: Record<string, unknown> = {}): GoalTracking {
  const tracking = parts.loadGoalTracking({
    run: runWith({ goal: { ...GOAL, ...overrides } }),
    setup: SETUP,
    durationMilliseconds: HOUR,
  });
  if (tracking === undefined) throw new Error('sem acompanhamento da meta');
  return tracking;
}

function candleAt(offset: number): EngineCandle {
  const openTime = START + offset * HOUR;
  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    openTime,
    closeTime: openTime + HOUR - 1,
    open: '100',
    high: '101',
    low: '99',
    close: '100',
    volume: '1',
  };
}

function point(equity: string, equityAtLow = equity): EquityPointDecision {
  return { candleOpenTime: 0, equity, equityAtLow, benchmark: '10000' };
}

describe('o acompanhamento da meta de uma simulação ao vivo', () => {
  test('execução sem meta não tem acompanhamento', () => {
    expect(
      parts.loadGoalTracking({
        run: { ...runWith(undefined), goalId: undefined },
        setup: SETUP,
        durationMilliseconds: HOUR,
      }),
    ).toBeUndefined();
  });

  test('os níveis saem do saldo da execução e a meta da fotografia gravada no pedido', () => {
    const tracking = trackingOf();
    expect(tracking.levels.target.toFixed()).toBe('10300');
    expect(tracking.levels.stop.toFixed()).toBe('9500');
    expect(tracking.horizonCandles).toBe(72);
    expect(tracking.periodStart).toBe(START);
    expect(tracking.initialBalance).toBe('10000');
    expect(trackingOf({ horizonDays: 30 }).horizonCandles).toBe(720);
  });

  test.each([
    ['sem pedido', undefined],
    ['pedido sem meta', { survival: {} }],
    ['meta que o motor recusa', { goal: { ...GOAL, horizonDays: 0 } }],
    ['meta com campo a mais', { goal: { ...GOAL, extra: 1 } }],
    ['pedido que não é objeto', 'texto'],
  ])('meta atrelada sem fotografia válida é dado da execução inválido: %s', (_name, request) => {
    expect(() =>
      parts.loadGoalTracking({ run: runWith(request), setup: SETUP, durationMilliseconds: HOUR }),
    ).toThrow();
  });
});

describe('o desfecho da meta, candle a candle', () => {
  test.each([
    ['nada ainda', 3, point('10100', '9900'), undefined],
    ['alvo atingido', 5, point('10300'), 'reached'],
    ['perda máxima pelo vale', 5, point('10100', '9500'), 'stopped'],
    ['alvo e perda no mesmo candle: a perda', 5, point('10400', '9400'), 'stopped'],
    ['prazo no último candle da meta (72º)', 71, point('10100', '9900'), 'expired'],
    ['um candle antes do prazo', 70, point('10100', '9900'), undefined],
    ['retomada tardia, depois do prazo', 75, point('10100', '9900'), 'expired'],
    ['alvo no último candle vence o prazo', 71, point('10300'), 'reached'],
    ['o candle antes do início não conta (aquecimento)', -1, point('10400'), undefined],
    ['o primeiro candle da meta é o 1º', 0, point('10300'), 'reached'],
  ] as const)('%s', (_name, offset, equity, expected) => {
    const decision = parts.decideGoalStep({
      tracking: trackingOf(),
      candle: candleAt(offset),
      equityPoint: equity,
    });
    expect(decision?.outcome).toBe(expected);
  });

  test('candle sem ponto de patrimônio (ainda aquecendo) não decide nada', () => {
    expect(
      parts.decideGoalStep({ tracking: trackingOf(), candle: candleAt(5), equityPoint: null }),
    ).toBeUndefined();
  });

  test('a decisão leva o desfecho gravado no banco e o patrimônio do desfecho', () => {
    const decide = (equity: EquityPointDecision): GoalDecision | undefined =>
      parts.decideGoalStep({ tracking: trackingOf(), candle: candleAt(5), equityPoint: equity });
    expect(decide(point('10350'))).toMatchObject({
      outcome: 'reached',
      runOutcome: 'goal_reached',
      finalValue: '10350',
    });
    expect(decide(point('10100', '9400'))).toMatchObject({
      outcome: 'stopped',
      runOutcome: 'goal_stopped',
      finalValue: '9400',
    });
    expect(
      parts.decideGoalStep({
        tracking: trackingOf(),
        candle: candleAt(71),
        equityPoint: point('10100'),
      }),
    ).toMatchObject({ outcome: 'expired', runOutcome: 'goal_expired', finalValue: '10100' });
  });
});

describe('a saída por meta: comandos no fechamento do candle do desfecho', () => {
  test.each([
    ['reached', 'goal_reached'],
    ['stopped', 'goal_max_loss'],
    ['expired', 'goal_expired'],
  ] as const)('%s vende a posição e para de entrar (motivo %s)', (outcome, reason) => {
    const candle = candleAt(5);
    const commands = parts.buildGoalCommands({ runId: 'run-1', outcome, candle });
    expect(commands.map((command) => command.kind)).toStrictEqual(['exit_position', 'halt']);
    for (const command of commands) {
      expect(command).toMatchObject({ reason, issuedAt: candle.closeTime });
    }
    expect(new Set(commands.map((command) => command.commandId)).size).toBe(2);
    expect(commands[0]?.commandId).toBe(`goal:run-1:${outcome}:exit_position`);
  });
});

describe('a carteira assentada: sem posição nem ordem pendente', () => {
  const engine = createEngine();
  const state = engine.createInitialState({ strategy: CLASSIC_STRATEGY, run: SETUP });

  test('estado inicial está assentado', () => {
    expect(parts.isWalletSettled(state)).toBe(true);
  });

  test('posição aberta ou ordem pendente não', () => {
    const withPosition = structuredClone(state);
    (withPosition.wallet as { position: unknown }).position = { quantity: '1' };
    const withOrder = structuredClone(state);
    (withOrder.wallet as { pendingOrder: unknown }).pendingOrder = { orderKey: 'x' };
    expect(parts.isWalletSettled(withPosition)).toBe(false);
    expect(parts.isWalletSettled(withOrder)).toBe(false);
  });
});

describe('o conteúdo do alerta de desfecho', () => {
  test('só mercado e meta, em texto exato, e o esquema o aceita', () => {
    const decision = parts.decideGoalStep({
      tracking: trackingOf(),
      candle: candleAt(5),
      equityPoint: point('10350'),
    });
    if (decision === undefined) throw new Error('sem decisão');
    const alert = parts.buildGoalAlert({
      tracking: trackingOf(),
      candle: candleAt(5),
      decision,
      run: { symbol: 'BTCUSDT', timeframe: '1h' },
    });
    expect(alert).toMatchObject({ candleTime: candleAt(5).openTime, side: 'GOAL' });
    expect(alert.payload).toStrictEqual({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      outcome: 'goal_reached',
      targetRate: '0.03',
      maxLossRate: '0.05',
      horizonDays: 3,
      initialBalance: '10000',
      finalValue: '10350',
      resultRate: '0.035',
    });
    expect(parts.goalAlertPayloadSchema.safeParse(alert.payload).success).toBe(true);
  });

  test('o resultado é arredondado para BAIXO a 8 casas (contra o usuário)', () => {
    const resultOf = (finalValue: string): unknown =>
      parts.buildGoalAlert({
        tracking: trackingOf(),
        candle: candleAt(71),
        decision: { outcome: 'expired', runOutcome: 'goal_expired', finalValue },
        run: { symbol: 'BTCUSDT', timeframe: '1h' },
      }).payload;
    expect(resultOf('9999.99999999')).toMatchObject({ resultRate: '-0.00000001' });
    expect(resultOf('10000.00000001')).toMatchObject({ resultRate: '0' });
    expect(resultOf('10000')).toMatchObject({ resultRate: '0' });
    expect(resultOf('9500')).toMatchObject({ resultRate: '-0.05' });
  });

  test('esquema recusa campo a mais, desfecho desconhecido e texto no lugar do número', () => {
    const valid = {
      symbol: 'BTCUSDT',
      timeframe: '1h',
      outcome: 'goal_reached',
      targetRate: '0.03',
      maxLossRate: '0.05',
      horizonDays: 3,
      initialBalance: '10000',
      finalValue: '10350',
      resultRate: '0.035',
    };
    expect(parts.goalAlertPayloadSchema.safeParse(valid).success).toBe(true);
    expect(parts.goalAlertPayloadSchema.safeParse({ ...valid, chatId: '1' }).success).toBe(false);
    expect(parts.goalAlertPayloadSchema.safeParse({ ...valid, outcome: 'goal_won' }).success).toBe(
      false,
    );
    expect(parts.goalAlertPayloadSchema.safeParse({ ...valid, horizonDays: '3' }).success).toBe(
      false,
    );
  });
});
