// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  AnalystPosition,
  LockKey,
  RiskLock,
  RiskLockContext,
} from '../packages/risk-analyst/src/index.js';
import {
  CANDLE,
  closedPosition,
  defaultWallet,
  openPosition,
} from './fixtures/risk-analyst/decision-scenario.fixture.js';
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const { computeRiskLocks } = await loadRiskAnalystApi();

// T1.3 da spec 007 (ADR 0002, A10): as cinco travas à mão, cada borda exata (1% da perda, 3ª perda e a pausa de 4 velas,
// 8ª entrada, folga igual a 2 operações, movimento igual a 2 vezes o custo) e a ordem fixa.

const T = 50_000 * CANDLE;
const NO_LOCKS_CONTEXT: RiskLockContext = {
  candleTime: T,
  wallet: defaultWallet(),
  goal: null,
  riskPerTrade: '0.01',
  atrRate: '0.015',
  roundTripCost: '0.003',
  moveToCost: '5',
};

function locksOf(overrides: Partial<RiskLockContext> = {}): readonly RiskLock[] {
  return computeRiskLocks({ ...NO_LOCKS_CONTEXT, ...overrides });
}

function lockOf(key: LockKey, overrides: Partial<RiskLockContext> = {}): RiskLock {
  const lock = locksOf(overrides).find((candidate) => candidate.key === key);
  if (lock === undefined) throw new Error(`sem a trava ${key}`);
  return lock;
}

function walletWith(
  positions: readonly AnalystPosition[],
  equity = '1000',
): RiskLockContext['wallet'] {
  return defaultWallet({ positions, equity });
}

describe('as cinco travas', () => {
  test('na ordem da A10, todas mostradas e nenhuma ativa em mercado calmo e carteira limpa', () => {
    const locks = locksOf();
    expect(locks.map((lock) => lock.key)).toStrictEqual([
      'daily_loss',
      'loss_streak',
      'trade_count',
      'goal_room',
      'move_cost',
    ]);
    expect(locks.map((lock) => lock.isActive)).toStrictEqual([false, false, false, false, false]);
    expect(locks.map((lock) => lock.isApplicable)).toStrictEqual([true, true, true, false, true]);
  });
});

describe('perda do dia (1% do saldo inicial em 24 h)', () => {
  test('perde 10 de 1.000 e a trava liga exatamente em 1% (≥)', () => {
    const atLimit = lockOf('daily_loss', { wallet: walletWith([], '990') });
    expect(atLimit).toMatchObject({ current: '0.01', limit: '0.01', isActive: true });
    const below = lockOf('daily_loss', { wallet: walletWith([], '990.01') });
    expect(below.isActive).toBe(false);
    expect(below.current).toBe('0.00999');
  });

  test('a referência é o patrimônio de 24 h atrás, não o saldo inicial', () => {
    const wallet = defaultWallet({ equity: '1100', equityReference: '1120' });
    const lock = lockOf('daily_loss', { wallet });
    expect(lock).toMatchObject({ current: '0.02', isActive: true });
  });

  test('lucro em 24 h mostra perda "0" e a trava fica desligada', () => {
    const wallet = defaultWallet({ equity: '1050', equityReference: '1000' });
    expect(lockOf('daily_loss', { wallet })).toMatchObject({ current: '0', isActive: false });
  });

  test('a perda mostrada sobe na última casa (contra o usuário)', () => {
    const wallet = defaultWallet({ initialBalance: '3', equity: '2.99', equityReference: '3' });
    expect(lockOf('daily_loss', { wallet }).current).toBe('0.003333333334');
  });
});

describe('perdas seguidas (3, pausa de 4 velas)', () => {
  const loss = (closedAt: number, openedAt = closedAt - 2 * CANDLE): AnalystPosition =>
    closedPosition({ openedCandleTime: openedAt, closedCandleTime: closedAt, netProfit: '-1' });
  const win = (closedAt: number): AnalystPosition =>
    closedPosition({
      openedCandleTime: closedAt - 2 * CANDLE,
      closedCandleTime: closedAt,
      netProfit: '2',
    });

  test('3 perdas, a última há 3 velas: ativa; há 4 velas a pausa acabou', () => {
    const active = [loss(T - 3 * CANDLE), loss(T - 8 * CANDLE), loss(T - 12 * CANDLE)];
    expect(lockOf('loss_streak', { wallet: walletWith(active) })).toMatchObject({
      current: '3',
      limit: '3',
      isActive: true,
    });
    const expired = [loss(T - 4 * CANDLE), loss(T - 8 * CANDLE), loss(T - 12 * CANDLE)];
    expect(lockOf('loss_streak', { wallet: walletWith(expired) })).toMatchObject({
      current: '3',
      isActive: false,
    });
  });

  test('a terceira perda liga a trava na mesma vela em que fecha (t − c = 0)', () => {
    const fresh = [loss(T), loss(T - 5 * CANDLE), loss(T - 9 * CANDLE)];
    expect(lockOf('loss_streak', { wallet: walletWith(fresh) }).isActive).toBe(true);
  });

  test('duas perdas e uma vitória não ligam; a vitória mais nova zera a sequência', () => {
    const two = [loss(T - CANDLE), loss(T - 5 * CANDLE), win(T - 9 * CANDLE)];
    expect(lockOf('loss_streak', { wallet: walletWith(two) })).toMatchObject({
      current: '2',
      isActive: false,
    });
    const reset = [
      win(T - CANDLE),
      loss(T - 5 * CANDLE),
      loss(T - 9 * CANDLE),
      loss(T - 12 * CANDLE),
    ];
    expect(lockOf('loss_streak', { wallet: walletWith(reset) })).toMatchObject({
      current: '0',
      isActive: false,
    });
  });

  test('conta pela ordem de FECHAMENTO, não pela ordem da lista; a aberta e a futura não contam', () => {
    const shuffled = [
      loss(T - 12 * CANDLE),
      openPosition(T - CANDLE),
      loss(T - 3 * CANDLE),
      loss(T - 8 * CANDLE),
      loss(T + 2 * CANDLE),
    ];
    expect(lockOf('loss_streak', { wallet: walletWith(shuffled) })).toMatchObject({
      current: '3',
      isActive: true,
    });
  });

  test('lucro zero não é perda', () => {
    const flat = closedPosition({
      openedCandleTime: T - 4 * CANDLE,
      closedCandleTime: T - CANDLE,
      netProfit: '0',
    });
    expect(lockOf('loss_streak', { wallet: walletWith([flat]) }).current).toBe('0');
  });
});

describe('operações em 24 h (teto de 8)', () => {
  const opened = (times: readonly number[]): AnalystPosition[] =>
    times.map((time) => openPosition(time));

  test('8 entradas em (t − 96·d, t] ligam a trava; 7 não', () => {
    const eight = opened(Array.from({ length: 8 }, (_unused, index) => T - index * CANDLE));
    expect(lockOf('trade_count', { wallet: walletWith(eight) })).toMatchObject({
      current: '8',
      limit: '8',
      isActive: true,
    });
    expect(lockOf('trade_count', { wallet: walletWith(eight.slice(1)) })).toMatchObject({
      current: '7',
      isActive: false,
    });
  });

  test('a janela é aberta em baixo: a entrada de t − 96·d já saiu e a de t entra', () => {
    const edges = opened([T - 96 * CANDLE, T - 95 * CANDLE, T]);
    expect(lockOf('trade_count', { wallet: walletWith(edges) }).current).toBe('2');
  });

  test('posição fechada também conta como entrada', () => {
    const closed = closedPosition({
      openedCandleTime: T - 10 * CANDLE,
      closedCandleTime: T - 5 * CANDLE,
      netProfit: '1',
    });
    expect(
      lockOf('trade_count', { wallet: walletWith([closed, openPosition(T - CANDLE)]) }).current,
    ).toBe('2');
  });
});

describe('folga até a perda máxima da meta (2 operações)', () => {
  const goal = { targetRate: '0.03', maxLossRate: '0.1', horizonDays: 7 };

  test('sem meta não se aplica: sem valor, desligada e o mínimo continua mostrado', () => {
    expect(lockOf('goal_room')).toStrictEqual({
      key: 'goal_room',
      current: null,
      limit: '0.02',
      isActive: false,
      isApplicable: false,
    });
  });

  test('a borda: com riskPerTrade 0,05 o mínimo é 10% e folga de 100 sobre 1.000 NÃO liga; 99,99 sobre 999,99 liga', () => {
    const atEdge = lockOf('goal_room', {
      goal,
      riskPerTrade: '0.05',
      wallet: walletWith([], '1000'),
    });
    expect(atEdge).toMatchObject({ current: '0.1', limit: '0.1', isActive: false });
    const below = lockOf('goal_room', {
      goal,
      riskPerTrade: '0.05',
      wallet: walletWith([], '999.99'),
    });
    expect(below.isActive).toBe(true);
    expect(below.current?.startsWith('0.09999')).toBe(true);
  });

  test('o piso é o da meta: saldo inicial × (1 − perda máxima), arredondado para cima', () => {
    const wallet = defaultWallet({ initialBalance: '333.333', equity: '300' });
    const lock = lockOf('goal_room', { goal, riskPerTrade: '0.01', wallet });
    // piso = ceil8(333,333 × 0,9) = 299,9997; folga = 0,0003 sobre 300.
    expect(lock).toMatchObject({ current: '0.000001', isActive: true });
  });

  test('patrimônio abaixo do piso dá folga negativa e liga', () => {
    const lock = lockOf('goal_room', { goal, wallet: walletWith([], '890') });
    expect(lock.isActive).toBe(true);
    expect(lock.current?.startsWith('-')).toBe(true);
  });
});

describe('movimento ÷ custo (mínimo 2)', () => {
  test('ATR% igual a 2 vezes o custo não liga; um pouco abaixo liga', () => {
    const edge = lockOf('move_cost', { atrRate: '0.006', moveToCost: '2' });
    expect(edge).toMatchObject({ current: '2', limit: '2', isActive: false });
    const below = lockOf('move_cost', { atrRate: '0.0059999', moveToCost: '1.999966' });
    expect(below.isActive).toBe(true);
  });

  test('sem ATR (aquecendo) a trava não liga; custo zero também não', () => {
    expect(lockOf('move_cost', { atrRate: null, moveToCost: null })).toMatchObject({
      current: null,
      isActive: false,
    });
    expect(lockOf('move_cost', { roundTripCost: '0', moveToCost: null }).isActive).toBe(false);
  });
});
