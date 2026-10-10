// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readPostgresErrorCode } from '../src/postgres-error-code.js';
import type { DatabaseHandle } from '../src/database-handle.js';
import type { OwnerScope } from '../src/ownership/owner-scope.js';
import type { UserId } from '../src/ownership/user-id.js';
import { RUN_KIND } from '../src/runs/run.constant.js';
import type { CreateRunParams, RunRecord } from '../src/runs/run.types.js';
import {
  COMMAND_KIND,
  COMMAND_REASON,
  COMMAND_STATUS,
  EXIT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  ORDER_TYPE,
  POSITION_STATUS,
  REGIME,
  SIGNAL_ACTION,
  WALK_FORWARD_WINDOW_STATUS,
} from '../src/run-results/run-result.constant.js';
import type {
  CommandInput,
  EquityPointInput,
  FillInput,
  OrderInput,
  PositionInput,
  SignalInput,
  WalkForwardWindowInput,
} from '../src/run-results/run-result.types.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import { createStrategyRepository } from '../src/strategies/strategy.repository.js';
import type { StrategyVersionRecord } from '../src/strategies/strategy.types.js';
import { resolveUserBySubject } from '../src/users/resolve-user-by-subject.js';
import { USER_RESOLUTION_STATUS } from '../src/users/user-resolution.constant.js';

export const SYNTHETIC_CANDLE_MILLISECONDS = 3_600_000;
export const SYNTHETIC_FIRST_CANDLE_TIME = 1_700_000_000_000;
export const SYNTHETIC_EQUITY_POINTS = 17_520;
export const SYNTHETIC_SIGNALS = 4_000;
export const SYNTHETIC_TRADES = 300;

export type PersistenceOwner = { readonly userId: UserId; readonly scope: OwnerScope };

export async function resolvePersistenceOwner(
  handle: DatabaseHandle,
  subject: string,
): Promise<PersistenceOwner> {
  const resolution = await resolveUserBySubject(handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  return { userId: resolution.userId, scope: resolution.scope };
}

export function hashOf(text: string): string {
  return new Bun.CryptoHasher('sha256').update(text).digest('hex');
}

export function candleTimeAt(index: number): number {
  return SYNTHETIC_FIRST_CANDLE_TIME + index * SYNTHETIC_CANDLE_MILLISECONDS;
}

export async function seedStrategyVersion(
  handle: DatabaseHandle,
  owner: PersistenceOwner,
): Promise<StrategyVersionRecord> {
  const strategies = createStrategyRepository(handle);
  const strategy = await strategies.createStrategy(owner.scope, {
    name: `Estratégia ${crypto.randomUUID()}`,
    isExample: false,
  });
  const config = { schemaVersion: 1, name: strategy.name, nonce: crypto.randomUUID() };
  const added = await strategies.addVersion(owner.scope, {
    strategyId: strategy.id,
    config,
    configHash: hashOf(JSON.stringify(config)),
  });
  if (added === undefined) throw new Error('estratégia recém-criada não aceitou versão');
  return added.version;
}

export function buildRunParams(
  strategyVersionId: string,
  overrides: Partial<CreateRunParams> = {},
): CreateRunParams {
  const runParameters = { symbol: 'BTCUSDT', timeframe: '1h', initialBalance: '10000' };
  return {
    strategyVersionId,
    kind: RUN_KIND.BACKTEST,
    symbol: 'BTCUSDT',
    timeframe: '1h',
    runParameters,
    runHash: hashOf(JSON.stringify(runParameters)),
    engineVersion: 'engine-2',
    signalEngineVersion: 'signal-2',
    metricsVersion: 'metrics-1',
    periodStart: SYNTHETIC_FIRST_CANDLE_TIME,
    periodEnd: candleTimeAt(SYNTHETIC_EQUITY_POINTS),
    migratedFromRunId: undefined,
    ...overrides,
  };
}

export async function seedRun(
  handle: DatabaseHandle,
  owner: PersistenceOwner,
  overrides: Partial<CreateRunParams> = {},
): Promise<RunRecord> {
  const version = await seedStrategyVersion(handle, owner);
  const run = await createRunRepository(handle).createRun(
    owner.scope,
    buildRunParams(version.id, overrides),
  );
  if (run === undefined) throw new Error('execução recém-semeada não foi criada');
  return run;
}

export function buildSignals(count: number): readonly SignalInput[] {
  return Array.from({ length: count }, (_unused, index) => ({
    candleTime: candleTimeAt(index),
    action: index % 3 === 0 ? SIGNAL_ACTION.BUY : SIGNAL_ACTION.HOLD,
    score: `${(index % 7) - 3}.5`,
    regime: REGIME.TRENDING,
    votes: [{ ruleId: 'ema', family: 'trend', vote: 1, weight: '1.5', isMissing: false }],
    indicators: { 'rule:ema-9-21': 100.5 + index, 'risk:atr': null },
    sentimentObservation:
      index % 2 === 0 ? { value: 40, observedAt: 1, source: 'fixture' } : undefined,
    reason: `Motivo do sinal ${index}`,
  }));
}

export function buildOrders(count: number, keyPrefix = ''): readonly OrderInput[] {
  return Array.from({ length: count }, (_unused, index) => ({
    engineKey: `${keyPrefix}order-${index}`,
    side: ORDER_SIDE.BUY,
    type: ORDER_TYPE.MARKET,
    purpose: ORDER_PURPOSE.ENTRY,
    status: ORDER_STATUS.FILLED,
    reason: undefined,
    quantity: '0.01500000',
    price: `${30_000 + index}.00000000`,
    limitPrice: undefined,
    triggerPrice: undefined,
    riskAmount: '100.00000000',
    stopDistance: '1234.567890123456',
    targetDistance: '1851.851835185184',
    eligibleCandles: undefined,
    createdCandleTime: candleTimeAt(index),
    expiresCandleTime: undefined,
    lastEventCandleTime: candleTimeAt(index + 1),
  }));
}

export function buildFills(count: number): readonly FillInput[] {
  return Array.from({ length: count }, (_unused, index) => ({
    orderKey: `order-${index}`,
    positionKey: `position-${index}`,
    candleTime: candleTimeAt(index + 1),
    side: ORDER_SIDE.BUY,
    price: `${30_000 + index}.00000000`,
    quantity: '0.01500000',
    notional: `${450 + index}.00000000`,
    fee: '0.45000000',
  }));
}

export function buildPositions(count: number): readonly PositionInput[] {
  return Array.from({ length: count }, (_unused, index) => ({
    engineKey: `position-${index}`,
    status: POSITION_STATUS.CLOSED,
    entryPrice: `${30_000 + index}.00000000`,
    quantity: '0.01500000',
    stopPrice: '29000.00000000',
    targetPrice: '31000.00000000',
    entryFee: '0.45000000',
    exitPrice: '30500.00000000',
    exitFee: '0.46000000',
    netProfit: '6.59000000',
    exitReason: EXIT_REASON.TARGET,
    openedCandleTime: candleTimeAt(index + 1),
    closedCandleTime: candleTimeAt(index + 5),
  }));
}

export function buildEquityPoints(count: number): readonly EquityPointInput[] {
  return Array.from({ length: count }, (_unused, index) => ({
    candleTime: candleTimeAt(index),
    equity: `${10_000 + index}.12345678`,
    equityAtLow: `${9_990 + index}.12345678`,
    benchmark: (10_000 + index / 2).toFixed(8),
  }));
}

export function buildCommands(count: number): readonly CommandInput[] {
  return Array.from({ length: count }, (_unused, index) => ({
    commandId: `command-${index}`,
    kind: COMMAND_KIND.HALT,
    reason: COMMAND_REASON.USER_STOP,
    issuedAt: candleTimeAt(index),
    candleTime: candleTimeAt(index),
    status: COMMAND_STATUS.APPLIED,
  }));
}

// SQLSTATE do erro que a consulta provoca; `undefined` quando ela é aceita.
export async function captureErrorCode(query: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await query;
    return undefined;
  } catch (error: unknown) {
    return readPostgresErrorCode(error);
  }
}

const WINDOW_TRAIN_CANDLES = 10;
const WINDOW_TEST_CANDLES = 4;

export function buildWindows(count: number): readonly WalkForwardWindowInput[] {
  return Array.from({ length: count }, (_unused, index) => ({
    windowIndex: index,
    trainStart: candleTimeAt(index * WINDOW_TEST_CANDLES),
    trainEnd: candleTimeAt(index * WINDOW_TEST_CANDLES + WINDOW_TRAIN_CANDLES),
    testStart: candleTimeAt(index * WINDOW_TEST_CANDLES + WINDOW_TRAIN_CANDLES),
    testEnd: candleTimeAt(index * WINDOW_TEST_CANDLES + WINDOW_TRAIN_CANDLES + WINDOW_TEST_CANDLES),
    bestParams: {
      combinationIndex: index,
      assignment: [{ path: 'risk.atrPeriod', value: 10 + index }],
    },
    status: WALK_FORWARD_WINDOW_STATUS.OK,
    inSample: { trades: 12 + index, sharpe: '1.25' },
    outOfSample: { scale: '1', sharpe: '0.4' },
    eligibleCombinations: 3,
  }));
}
