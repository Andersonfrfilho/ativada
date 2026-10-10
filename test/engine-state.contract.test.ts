// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  assertStepInput,
  canonicalJson,
  createInitialEngineState,
  decimalFromIndicator,
  deserializeEngineState,
  ENGINE_STATE_ERROR_CODE,
  EngineDecimal,
  EngineInputError,
  EngineStateError,
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  roundToIncrement,
  serializeEngineState,
  type EngineState,
  type StepInput,
} from '../packages/strategy-engine/src/index.js';
import {
  buildCandles,
  buildReferenceStrategy,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';

const ENGINE_VERSION = 'contract-test-1';
const STRATEGY = buildReferenceStrategy({ orderType: 'market' });
const [FIRST_CANDLE, SECOND_CANDLE] = buildCandles([
  ['100', '101', '99', '100'],
  ['100', '101', '99', '100'],
]);

function requireCandle<TValue>(value: TValue | undefined): TValue {
  if (value === undefined) throw new Error('Candle ausente.');
  return value;
}

function initialState(): EngineState {
  return createInitialEngineState({
    strategy: STRATEGY,
    engineVersion: ENGINE_VERSION,
    leadInCandles: 9,
  });
}

function captureStateError(run: () => unknown): EngineStateError {
  try {
    run();
  } catch (error) {
    if (error instanceof EngineStateError) return error;
    throw error;
  }
  throw new Error('Deveria ter falhado com EngineStateError.');
}

function stepInput(overrides: Partial<StepInput>): StepInput {
  return {
    strategy: STRATEGY,
    state: initialState(),
    candle: requireCandle(FIRST_CANDLE),
    ...overrides,
  };
}

const OPEN_POSITION = {
  positionKey: 'position-1',
  openedCandleOpenTime: 0,
  entryPrice: '100.05',
  quantity: '1',
  stopPrice: '96',
  targetPrice: '106',
  entryFee: '0.1',
};

describe('engine state', () => {
  test('starts empty, bound to the strategy version and the engine version', () => {
    expect(initialState()).toStrictEqual({
      version: 1,
      engineVersion: ENGINE_VERSION,
      configHash: STRATEGY.configHash,
      leadInCandles: 9,
      processedCandles: 0,
      lastCandleOpenTime: null,
      sequence: 0,
      isHalted: false,
      cash: '10000',
      position: null,
      pendingOrder: null,
      benchmark: null,
      indicators: {},
    });
  });

  test('round-trips through canonical JSON byte for byte', () => {
    const state = { ...initialState(), indicators: { ema: { value: 0.1 + 0.2, count: 3 } } };
    const text = serializeEngineState(state);
    expect(text.startsWith('{"benchmark":null,"cash":"10000","configHash":')).toBe(true);
    expect(deserializeEngineState(text)).toStrictEqual(state);
    expect(serializeEngineState(deserializeEngineState(text))).toBe(text);
  });

  test('rejects invalid JSON, another version and an invalid shape with distinct codes', () => {
    const text = serializeEngineState(initialState());
    expect(captureStateError(() => deserializeEngineState('{')).code).toBe(
      ENGINE_STATE_ERROR_CODE.INVALID_JSON,
    );
    expect(
      captureStateError(() => deserializeEngineState(text.replace('"version":1', '"version":2')))
        .code,
    ).toBe(ENGINE_STATE_ERROR_CODE.UNSUPPORTED_VERSION);
    expect(
      captureStateError(() => deserializeEngineState(text.replace('{', '{"extra":1,'))).code,
    ).toBe(ENGINE_STATE_ERROR_CODE.INVALID_STATE);
  });

  test('rejects states that break the single-position invariants', () => {
    const pendingBuy = {
      orderKey: 'order-1',
      side: 'buy',
      type: 'market',
      purpose: 'entry',
      createdCandleOpenTime: 0,
      limitPrice: null,
      quoteBudget: '100',
      stopDistance: '4',
      targetDistance: '6',
      eligibleCandles: null,
      exitReason: null,
    } as const;
    const withBoth = { ...initialState(), position: OPEN_POSITION, pendingOrder: pendingBuy };
    const pendingSellWithoutPosition = {
      ...initialState(),
      pendingOrder: { ...pendingBuy, side: 'sell', purpose: 'exit', exitReason: 'signal' },
    } as const;
    const processedWithoutTime = { ...initialState(), processedCandles: 1 };
    for (const broken of [withBoth, pendingSellWithoutPosition, processedWithoutTime]) {
      expect(captureStateError(() => serializeEngineState(broken)).code).toBe(
        ENGINE_STATE_ERROR_CODE.INVALID_STATE,
      );
    }
  });

  test('never serializes something that would not come back the same', () => {
    const withMap = {
      ...initialState(),
      indicators: { cache: new Map() },
    } as unknown as EngineState;
    const withDecimal = {
      ...initialState(),
      cash: new EngineDecimal('1'),
    } as unknown as EngineState;
    const withUndefined = { ...initialState(), benchmark: undefined } as unknown as EngineState;
    for (const broken of [withMap, withDecimal, withUndefined]) {
      expect(() => serializeEngineState(broken)).toThrow(EngineStateError);
    }
  });
});

describe('step input guard', () => {
  test('accepts the next candle and a sentiment observed up to the close', () => {
    const candle = requireCandle(FIRST_CANDLE);
    const sentiment = { value: 40, observedAt: candle.closeTime };
    expect(() =>
      assertStepInput({ input: stepInput({ sentiment }), engineVersion: ENGINE_VERSION }),
    ).not.toThrow();
  });

  test('refuses what would break the contract', () => {
    const first = requireCandle(FIRST_CANDLE);
    const second = requireCandle(SECOND_CANDLE);
    const processed = {
      ...initialState(),
      processedCandles: 1,
      lastCandleOpenTime: second.openTime,
    };
    const inputs: readonly StepInput[] = [
      stepInput({ strategy: { ...STRATEGY, configHash: 'f'.repeat(64) } }),
      stepInput({ candle: { ...first, symbol: 'ETHUSDT' } }),
      stepInput({ candle: { ...first, timeframe: '4h' } }),
      stepInput({
        candle: { ...first, openTime: first.openTime + 1, closeTime: first.closeTime + 1 },
      }),
      stepInput({ candle: { ...first, closeTime: first.closeTime + 1 } }),
      stepInput({ state: processed, candle: second }),
      stepInput({ state: processed, candle: first }),
      stepInput({ sentiment: { value: 40, observedAt: first.closeTime + 1 } }),
    ];
    for (const input of inputs) {
      expect(() => assertStepInput({ input, engineVersion: ENGINE_VERSION })).toThrow(
        EngineInputError,
      );
    }
  });

  test('refuses a state written by another engine version', () => {
    const error = captureStateError(() =>
      assertStepInput({ input: stepInput({}), engineVersion: 'other-2' }),
    );
    expect(error.code).toBe(ENGINE_STATE_ERROR_CODE.ENGINE_MISMATCH);
  });
});

describe('engine decimals and canonical JSON', () => {
  test('round to the increment in the requested direction and format without exponent', () => {
    const value = new EngineDecimal('100.0525');
    const increment = new EngineDecimal('0.01');
    expect(
      formatEngineDecimal(roundToIncrement({ value, increment, direction: ROUNDING_DIRECTION.UP })),
    ).toBe('100.06');
    expect(
      formatEngineDecimal(
        roundToIncrement({ value, increment, direction: ROUNDING_DIRECTION.DOWN }),
      ),
    ).toBe('100.05');
    expect(
      formatEngineDecimal(
        roundMoney({ value: new EngineDecimal('0.000000001'), direction: ROUNDING_DIRECTION.UP }),
      ),
    ).toBe('0.00000001');
    expect(formatEngineDecimal(new EngineDecimal('1e-12'))).toBe('0.000000000001');
    expect(formatEngineDecimal(new EngineDecimal('-0'))).toBe('0');
  });

  test('an indicator float crosses to decimal with 15 significant digits and never as NaN', () => {
    expect(formatEngineDecimal(decimalFromIndicator(0.1 + 0.2))).toBe('0.3');
    expect(formatEngineDecimal(decimalFromIndicator(16 / 3))).toBe('5.33333333333333');
    expect(() => decimalFromIndicator(Number.NaN)).toThrow();
    expect(() => decimalFromIndicator(Number.POSITIVE_INFINITY)).toThrow();
  });

  test('canonical JSON sorts keys and refuses what JSON cannot carry', () => {
    expect(canonicalJson({ b: [2, { d: 1, c: null }], a: 'x' })).toBe(
      '{"a":"x","b":[2,{"c":null,"d":1}]}',
    );
    for (const invalid of [
      new Map(),
      Number.NaN,
      undefined,
      { value: undefined },
      new EngineDecimal(1),
    ]) {
      expect(() => canonicalJson(invalid)).toThrow();
    }
  });
});
