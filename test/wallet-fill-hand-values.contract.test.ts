// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createInitialWalletState,
  ENGINE_INPUT_ERROR_CODE,
  simulatedFillModel,
  type FillModelResult,
  type OpenPositionState,
  type PendingOrderState,
  type StrategyVersion,
  type WalletState,
} from '../packages/strategy-engine/src/index.js';
import {
  buildCandles,
  buildReferenceRun,
  buildReferenceStrategy,
  LIMIT_ENTRY,
  MARKET_ENTRY,
  type CandleSpec,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';

// Contas feitas à mão: tick 0,01, passo 0,00001, taxa 0,1%, slippage 0,05%, mínimo 5, saldo 10 000,
// risco 1% (valor em risco 100), stop 2×ATR, alvo 3×ATR com ATR 2 (distâncias 4 e 6).
const MARKET_STRATEGY = buildReferenceStrategy(MARKET_ENTRY);
const LIMIT_STRATEGY = buildReferenceStrategy(LIMIT_ENTRY);
const RUN = buildReferenceRun();
const DECISION_CANDLE: CandleSpec = ['100', '101', '99', '100'];
const DECISION_OPEN_TIME = buildCandles([DECISION_CANDLE])[0]?.openTime ?? 0;

const MARKET_ENTRY_ORDER: PendingOrderState = {
  orderKey: 'order-0',
  side: 'buy',
  type: 'market',
  purpose: 'entry',
  createdCandleOpenTime: DECISION_OPEN_TIME,
  limitPrice: null,
  riskAmount: '100',
  stopDistance: '4',
  targetDistance: '6',
  eligibleCandles: null,
  decisionVolume: '100000',
  filledQuantity: '0',
  exitReason: null,
};

// P = 100,05; stop 96,05; alvo 106,05; saída estimada 96,00; 23,5513 unidades; taxa 2,35630757.
const CARRIED_POSITION: OpenPositionState = {
  positionKey: 'position-0',
  openedCandleOpenTime: DECISION_OPEN_TIME,
  entryPrice: '100.05',
  quantity: '23.5513',
  stopPrice: '96.05',
  targetPrice: '106.05',
  entryFee: '2.35630757',
};
const CASH_AFTER_ENTRY = '7641.33612743';
// Custo da entrada: 2356,307565 (23,5513 × 100,05, exato) + taxa 2,35630757.
const ENTRY_COST = '2358.66387257';

function walletOf(strategy: StrategyVersion, overrides: Partial<WalletState>): WalletState {
  return { ...createInitialWalletState({ strategy, run: RUN }), ...overrides };
}

function fill(params: {
  readonly strategy?: StrategyVersion;
  readonly state: Partial<WalletState>;
  readonly candle: CandleSpec;
}): FillModelResult {
  const strategy = params.strategy ?? MARKET_STRATEGY;
  const candle = buildCandles([DECISION_CANDLE, params.candle])[1];
  if (candle === undefined) throw new Error('Candle ausente.');
  return simulatedFillModel({
    strategy,
    run: RUN,
    state: walletOf(strategy, params.state),
    candle,
    executionReports: [],
  });
}

function limitOrder(eligibleCandles: number): PendingOrderState {
  return {
    ...MARKET_ENTRY_ORDER,
    type: 'limit',
    limitPrice: '99',
    eligibleCandles,
  };
}

describe('simulated fill model: entries by hand', () => {
  test('market entry fills at the open plus slippage; stop, target, quantity, fee and cash close', () => {
    const result = fill({
      state: { pendingOrder: MARKET_ENTRY_ORDER },
      candle: ['100', '101', '99', '100'],
    });
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]).toMatchObject({
      status: 'filled',
      price: '100.05',
      quantity: '23.5513',
      reason: null,
    });
    expect(result.openedPositions[0]).toMatchObject({
      entryPrice: '100.05',
      quantity: '23.5513',
      stopPrice: '96.05',
      targetPrice: '106.05',
      entryFee: '2.35630757',
    });
    expect(result.fills[0]).toMatchObject({ notional: '2356.307565', fee: '2.35630757' });
    expect(result.state.cash).toBe(CASH_AFTER_ENTRY);
    expect(result.state.pendingOrder).toBeNull();
  });

  test('the quantity is capped by the decision volume share and says so', () => {
    const result = fill({
      state: { pendingOrder: { ...MARKET_ENTRY_ORDER, decisionVolume: '30' } },
      candle: ['100', '101', '99', '100'],
    });
    expect(result.orders[0]).toMatchObject({
      status: 'filled',
      quantity: '0.3',
      reason: 'volume_capped',
    });
  });

  test('refusals: a stop above the slipped price, a notional below the minimum', () => {
    const invalidStop = fill({
      state: {
        pendingOrder: { ...MARKET_ENTRY_ORDER, stopDistance: '0.01', targetDistance: '0.015' },
      },
      candle: ['100', '101', '99', '100'],
    });
    expect(invalidStop.orders[0]).toMatchObject({ status: 'rejected', reason: 'invalid_stop' });
    expect(invalidStop.state.cash).toBe('10000');
    const belowMinimum = fill({
      state: { pendingOrder: { ...MARKET_ENTRY_ORDER, riskAmount: '0.2' } },
      candle: ['100', '101', '99', '100'],
    });
    expect(belowMinimum.orders[0]).toMatchObject({
      status: 'rejected',
      reason: 'below_min_notional',
    });
    expect(belowMinimum.openedPositions).toStrictEqual([]);
  });
});

describe('simulated fill model: limit orders by hand', () => {
  const limitState = (eligibleCandles: number): Partial<WalletState> => ({
    pendingOrder: limitOrder(eligibleCandles),
  });

  test('first eligible candle: the price improves to min(limit, open × (1 + slippage))', () => {
    const result = fill({
      strategy: LIMIT_STRATEGY,
      state: limitState(2),
      candle: ['98.5', '100', '98', '99.5'],
    });
    expect(result.fills[0]?.price).toBe('98.55');
  });

  test('from the second eligible candle on, an open below the limit fills at the limit, never better', () => {
    const result = fill({
      strategy: LIMIT_STRATEGY,
      state: limitState(1),
      candle: ['98.5', '100', '98', '99.5'],
    });
    expect(result.fills[0]?.price).toBe('99');
  });

  test('touching the limit is not a fill; it consumes a candle; the last one expires exactly there', () => {
    const touched = fill({
      strategy: LIMIT_STRATEGY,
      state: limitState(2),
      candle: ['100', '101', '99', '100'],
    });
    expect(touched.fills).toStrictEqual([]);
    expect(touched.orders).toStrictEqual([]);
    expect(touched.state.pendingOrder?.eligibleCandles).toBe(1);
    const expired = fill({
      strategy: LIMIT_STRATEGY,
      state: limitState(1),
      candle: ['100', '101', '99', '100'],
    });
    expect(expired.orders[0]).toMatchObject({ status: 'expired' });
    expect(expired.state.pendingOrder).toBeNull();
  });

  test('crossing the limit mid-candle fills at the limit and the target does not count that candle', () => {
    const result = fill({
      strategy: LIMIT_STRATEGY,
      state: limitState(2),
      candle: ['100', '120', '98.9', '110'],
    });
    expect(result.fills[0]?.price).toBe('99');
    expect(result.openedPositions[0]).toMatchObject({ stopPrice: '95', targetPrice: '105' });
    expect(result.closedPositions).toStrictEqual([]);
    expect(result.state.position).not.toBeNull();
  });

  test('crossing the limit mid-candle below the stop still stops the position in that candle', () => {
    const result = fill({
      strategy: LIMIT_STRATEGY,
      state: limitState(2),
      candle: ['100', '101', '94', '95'],
    });
    expect(result.closedPositions[0]).toMatchObject({ exitReason: 'stop', exitPrice: '94.95' });
  });
});

describe('simulated fill model: exits by hand', () => {
  const carried = (overrides: Partial<WalletState> = {}): Partial<WalletState> => ({
    cash: CASH_AFTER_ENTRY,
    position: CARRIED_POSITION,
    ...overrides,
  });

  test('a stop below the open exits at the open with slippage; the loss and the cash close', () => {
    const result = fill({ state: carried(), candle: ['90', '91', '89', '90'] });
    expect(result.closedPositions[0]).toMatchObject({
      exitReason: 'stop',
      exitPrice: '89.95',
      exitFee: '2.11843944',
      netProfit: '-242.34287701',
    });
    expect(result.orders.map((order) => `${order.type}:${order.status}`)).toStrictEqual([
      'stop:created',
      'stop:filled',
    ]);
    expect(result.orders[0]).toMatchObject({ triggerPrice: '96.05', price: null });
    expect(result.state.cash).toBe('9757.65712299');
    expect(result.state.position).toBeNull();
  });

  test('a stop touched without a gap exits at the stop minus slippage', () => {
    const result = fill({ state: carried(), candle: ['100', '101', '96.05', '99'] });
    expect(result.closedPositions[0]).toMatchObject({ exitReason: 'stop', exitPrice: '96' });
  });

  test('stop and target in the same candle: the stop wins', () => {
    const result = fill({ state: carried(), candle: ['100', '107', '95', '100'] });
    expect(result.closedPositions[0]).toMatchObject({ exitReason: 'stop', exitPrice: '96' });
  });

  test('the target needs the price to pass it; passing exits at the target, without slippage', () => {
    const touched = fill({ state: carried(), candle: ['100', '106.05', '99', '100'] });
    expect(touched.closedPositions).toStrictEqual([]);
    const passed = fill({ state: carried(), candle: ['106', '107', '105', '106.5'] });
    expect(passed.closedPositions[0]).toMatchObject({
      exitReason: 'target',
      exitPrice: '106.05',
      exitFee: '2.49761537',
      netProfit: '136.45387706',
    });
    expect(ENTRY_COST).toBe('2358.66387257');
  });

  test('a gap above the target exits at the target price, not at the open', () => {
    const result = fill({ state: carried(), candle: ['108', '109', '107', '108'] });
    expect(result.closedPositions[0]).toMatchObject({ exitReason: 'target', exitPrice: '106.05' });
  });

  test('a pending sell (signal or command) exits at the open with slippage against the user', () => {
    const exit: PendingOrderState = {
      orderKey: 'order-1',
      side: 'sell',
      type: 'market',
      purpose: 'exit',
      createdCandleOpenTime: DECISION_OPEN_TIME,
      limitPrice: null,
      riskAmount: null,
      stopDistance: null,
      targetDistance: null,
      eligibleCandles: null,
      decisionVolume: null,
      filledQuantity: '0',
      exitReason: 'signal',
    };
    const result = fill({
      state: carried({ pendingOrder: exit }),
      candle: ['98', '99', '97.8', '98.5'],
    });
    expect(result.closedPositions[0]).toMatchObject({ exitReason: 'signal', exitPrice: '97.95' });
  });
});

describe('simulated fill model: the exchange reports are not supported by the simulation', () => {
  test('refuses them loudly instead of ignoring them', () => {
    const candle = buildCandles([DECISION_CANDLE])[0];
    if (candle === undefined) throw new Error('Candle ausente.');
    const report = {
      kind: 'fill',
      reportId: 'report-1',
      reportedAt: candle.openTime,
      orderKey: 'order-0',
      price: '100',
      quantity: '1',
      fee: '0.1',
    } as const;
    expect(() =>
      simulatedFillModel({
        strategy: MARKET_STRATEGY,
        run: RUN,
        state: walletOf(MARKET_STRATEGY, {}),
        candle,
        executionReports: [report],
      }),
    ).toThrow(
      expect.objectContaining({ code: ENGINE_INPUT_ERROR_CODE.EXECUTION_REPORTS_UNSUPPORTED }),
    );
  });
});
