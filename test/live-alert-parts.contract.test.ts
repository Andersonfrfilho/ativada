// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeRunMetrics,
  EXIT_REASON,
  type EngineCandle,
  type EngineState,
  type OrderEvent,
  type SignalDecision,
  type StepDecisions,
} from '../packages/strategy-engine/src/index.js';
import { loadLiveAlertParts } from './fixtures/live/live-api.fixture.js';
import {
  buildLive,
  createTestEvaluator,
  tickUntilIdle,
} from './fixtures/live/live-scenarios.fixture.js';
import {
  equitySeries,
  MILLISECONDS_PER_DAY,
} from './fixtures/strategy-engine/metrics/metrics-series.fixture.js';
import { buildTrades } from './fixtures/strategy-engine/metrics/metrics-trades.fixture.js';
import { REAL_DATASETS } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

const { parseHitRate, alertPayloadSchema, buildStepAlert, isAlertableSignal } =
  await loadLiveAlertParts();
const TWO_DAYS = 2 * MILLISECONDS_PER_DAY;

function walkForwardMetrics(nets: readonly string[]): unknown {
  const metrics = computeRunMetrics({
    equityPoints: equitySeries({ equities: ['1000', '1000'], timeframeMilliseconds: TWO_DAYS }),
    closedPositions: buildTrades({
      timeframeMilliseconds: TWO_DAYS,
      specs: nets.map((netProfit, index) => ({
        netProfit,
        opened: index,
        closed: index,
        exitReason: EXIT_REASON.SIGNAL,
      })),
    }),
    openPosition: null,
    run: { initialBalance: '1000', timeframeMilliseconds: TWO_DAYS },
  });
  return JSON.parse(JSON.stringify({ ...metrics, overfitting: { isAlert: false } }));
}

describe('acerto histórico lido de runs.metrics do último walk-forward', () => {
  test('taxa de acerto e número de operações do relatório fora da amostra', () => {
    const metrics = walkForwardMetrics(['100', '-40', '-20', '-30', '60', '-10', '20']);
    expect(parseHitRate(metrics as never)).toStrictEqual({ winRate: '0.428571428571', trades: 7 });
  });

  test('o texto decimal do motor passa sem conversão para número', () => {
    const metrics = walkForwardMetrics(['10', '10', '-5']);
    expect(parseHitRate(metrics as never)?.winRate).toBe('0.666666666667');
  });

  test('sem operações a taxa não se define: nada de 0 inventado', () => {
    expect(parseHitRate(walkForwardMetrics([]) as never)).toBeUndefined();
  });

  test.each([
    ['ausente', undefined],
    ['texto', 'x'],
    ['lista', []],
    ['sem winRate', { trades: 3 }],
    ['winRate sem valor', { winRate: { value: null, reason: 'no_trades' }, trades: 0 }],
    ['trades negativo', { winRate: { value: '0.5', reason: null }, trades: -1 }],
    ['trades fracionário', { winRate: { value: '0.5', reason: null }, trades: 1.5 }],
    ['winRate numérico', { winRate: { value: 0.5, reason: null }, trades: 2 }],
    ['winRate que não é decimal', { winRate: { value: 'abc', reason: null }, trades: 2 }],
  ])('métrica ilegível (%s) vira "sem acerto"', (_name, metrics) => {
    expect(parseHitRate(metrics as never)).toBeUndefined();
  });
});

describe('conteúdo do alerta: esquema estrito', () => {
  const valid = {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    closePrice: '100.5',
    score: '2.5',
    regime: 'trending',
    reason: 'Compra 3/4',
    simulatedAction: 'enter',
    stopPrice: '95',
    targetPrice: '110',
    hitRate: { winRate: '0.5', trades: 4 },
  };

  test('o conteúdo válido passa; campo a mais, ação desconhecida ou campo faltando não', () => {
    expect(alertPayloadSchema.safeParse(valid).success).toBe(true);
    expect(alertPayloadSchema.safeParse({ ...valid, chatId: '1' }).success).toBe(false);
    expect(alertPayloadSchema.safeParse({ ...valid, simulatedAction: 'sell' }).success).toBe(false);
    expect(alertPayloadSchema.safeParse({ ...valid, reason: '' }).success).toBe(false);
    expect(alertPayloadSchema.safeParse({ ...valid, score: undefined }).success).toBe(false);
  });

  test.each(['abc', '', '1e3', 'NaN', '0.5.5', ' 0.5', '0,5', '.5', '5.'])(
    'taxa de acerto que não é decimal exato (%p) não passa: o formatador lançaria e o alerta voltaria para sempre',
    (winRate) => {
      const payload = { ...valid, hitRate: { winRate, trades: 4 } };
      expect(alertPayloadSchema.safeParse(payload).success).toBe(false);
    },
  );

  test.each(['0', '1', '0.583333333333', '-0.25'])(
    'taxa de acerto decimal (%p) passa',
    (winRate) => {
      const payload = { ...valid, hitRate: { winRate, trades: 4 } };
      expect(alertPayloadSchema.safeParse(payload).success).toBe(true);
    },
  );

  test('nível e acerto podem ser nulos (sem posição, sem walk-forward)', () => {
    const open = { ...valid, stopPrice: null, targetPrice: null, hitRate: null };
    expect(alertPayloadSchema.safeParse(open).success).toBe(true);
  });

  test('todo alerta que o passo ao vivo monta cumpre o esquema que o despachante exige', async () => {
    const dataset = REAL_DATASETS[0];
    if (dataset === undefined) throw new Error('conjunto real ausente');
    const live = buildLive({
      dataset,
      overrides: { hitRate: { winRate: '0.5', trades: 8 } },
    });
    const last = dataset.candles.at(-1);
    const { evaluator } = await createTestEvaluator(live, {
      maxStepsPerPass: 200,
      alerting: { now: () => last?.closeTime ?? 0, maxAgeCandles: 1_000_000 },
    });
    await tickUntilIdle(evaluator);
    expect(live.state.alerts.size).toBeGreaterThan(0);
    for (const alert of live.state.alerts.values()) {
      expect(alertPayloadSchema.safeParse(alert.payload).success).toBe(true);
    }
  });
});

const CANDLE: EngineCandle = {
  symbol: 'BTCUSDT',
  timeframe: '1h',
  openTime: 1_000,
  closeTime: 3_599_999,
  open: '100',
  high: '110',
  low: '90',
  close: '105',
  volume: '1',
};

function signalOf(action: SignalDecision['action']): SignalDecision {
  return {
    candleOpenTime: CANDLE.openTime,
    configHash: 'h',
    confirmedGapCandles: 0,
    action,
    score: '2',
    regime: 'trending',
    votes: [],
    indicators: {},
    sentiment: null,
    reason: 'motivo',
  };
}

function orderOf(overrides: Partial<OrderEvent>): OrderEvent {
  return {
    orderKey: 'order-1',
    candleOpenTime: CANDLE.openTime,
    status: 'created',
    side: 'buy',
    type: 'market',
    purpose: 'entry',
    createdCandleOpenTime: CANDLE.openTime,
    limitPrice: null,
    triggerPrice: null,
    price: null,
    quantity: null,
    riskAmount: '10',
    stopDistance: '5',
    targetDistance: '8',
    eligibleCandles: null,
    reason: null,
    ...overrides,
  };
}

function decisionsOf(signal: SignalDecision, orders: readonly OrderEvent[]): StepDecisions {
  return {
    signal,
    orders,
    fills: [],
    openedPositions: [],
    closedPositions: [],
    equityPoint: null,
    commands: [],
  };
}

const FLAT = { wallet: { position: null } } as unknown as EngineState;

function build(action: 'BUY' | 'SELL', orders: readonly OrderEvent[]): Record<string, unknown> {
  const signal = signalOf(action);
  if (!isAlertableSignal(signal)) throw new Error('sinal acionável esperado');
  const alert = buildStepAlert({
    signal,
    decisions: decisionsOf(signal, orders),
    candle: CANDLE,
    state: FLAT,
    hitRate: undefined,
  });
  return alert.payload as Record<string, unknown>;
}

describe('ação simulada: só a ordem que o sinal criou conta', () => {
  test('entrada criada: ação de entrar, com stop e alvo em volta do fechamento', () => {
    expect(build('BUY', [orderOf({})])).toMatchObject({
      simulatedAction: 'enter',
      stopPrice: '100',
      targetPrice: '113',
    });
  });

  test.each([
    ['recusada', 'rejected'],
    ['cancelada', 'cancelled'],
    ['expirada', 'expired'],
    ['preenchida', 'filled'],
  ] as const)('entrada %s no candle não é a ação do sinal', (_name, status) => {
    expect(build('BUY', [orderOf({ status })])).toMatchObject({
      simulatedAction: 'none',
      stopPrice: null,
      targetPrice: null,
    });
  });

  test('ordem criada num candle anterior (ainda pendente) não é a deste', () => {
    const older = orderOf({ createdCandleOpenTime: CANDLE.openTime - 3_600_000 });
    expect(build('BUY', [older])).toMatchObject({ simulatedAction: 'none' });
  });

  test('venda a mercado criada: ação de sair; stop e alvo de saída da proteção não contam como ação', () => {
    const exit = orderOf({
      side: 'sell',
      purpose: 'exit',
      stopDistance: null,
      targetDistance: null,
    });
    const protective = orderOf({ ...exit, type: 'stop', orderKey: 'order-2' });
    expect(build('SELL', [exit])).toMatchObject({ simulatedAction: 'exit' });
    expect(build('SELL', [protective])).toMatchObject({ simulatedAction: 'none' });
    expect(build('BUY', [protective])).toMatchObject({ simulatedAction: 'none' });
  });

  test('HOLD e candle sem sinal não são acionáveis', () => {
    expect(isAlertableSignal(signalOf('HOLD'))).toBe(false);
    expect(isAlertableSignal(null)).toBe(false);
    expect(isAlertableSignal(signalOf('BUY'))).toBe(true);
    expect(isAlertableSignal(signalOf('SELL'))).toBe(true);
  });
});
