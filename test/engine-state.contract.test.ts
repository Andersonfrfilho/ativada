// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  canonicalJson,
  createInitialEngineState,
  decimalFromIndicator,
  deserializeEngineState,
  ENGINE_STATE_ERROR_CODE,
  EngineDecimal,
  EngineStateError,
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  roundMoney,
  roundToIncrement,
  serializeEngineState,
  type EngineState,
  type OpenPositionState,
  type PendingOrderState,
} from '../packages/strategy-engine/src/index.js';
import {
  buildReferenceRun,
  buildReferenceStrategy,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';

const ENGINE_VERSION = 'contract-test-1';
const STRATEGY = buildReferenceStrategy({ orderType: 'market' });
const RUN = buildReferenceRun();
const LEAD_IN = 3;

function initialState(): EngineState {
  return createInitialEngineState({
    strategy: STRATEGY,
    run: RUN,
    engineVersion: ENGINE_VERSION,
    leadInCandles: LEAD_IN,
  });
}

// Estado depois de N candles com o aquecimento concluído (régua comprada se passou do aquecimento).
function tradingState(processedCandles: number): EngineState {
  const state = initialState();
  const lastCandleOpenTime = processedCandles * 3_600_000;
  return {
    ...state,
    signal: { ...state.signal, processedCandles, lastCandleOpenTime },
    wallet: {
      ...state.wallet,
      lastCandleOpenTime,
      firstSignalCandleOpenTime: processedCandles >= LEAD_IN ? 3 * 3_600_000 : null,
      benchmark: processedCandles > LEAD_IN ? { quantity: '1', cash: '1' } : null,
    },
  };
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

const OPEN_POSITION: OpenPositionState = {
  positionKey: 'position-1',
  openedCandleOpenTime: 0,
  entryPrice: '100.05',
  quantity: '1',
  stopPrice: '96',
  targetPrice: '106',
  entryFee: '0.1',
};

const PENDING_BUY: PendingOrderState = {
  orderKey: 'order-1',
  side: 'buy',
  type: 'market',
  purpose: 'entry',
  createdCandleOpenTime: 0,
  limitPrice: null,
  riskAmount: '100',
  stopDistance: '4',
  targetDistance: '6',
  eligibleCandles: null,
  filledQuantity: '0',
  exitReason: null,
};

const PENDING_SELL: PendingOrderState = {
  ...PENDING_BUY,
  side: 'sell',
  purpose: 'exit',
  riskAmount: null,
  stopDistance: null,
  targetDistance: null,
  exitReason: 'signal',
};

function withWallet(patch: Partial<EngineState['wallet']>): EngineState {
  const state = tradingState(5);
  return { ...state, wallet: { ...state.wallet, ...patch } };
}

describe('engine state', () => {
  test('starts empty, bound to the strategy version, the run parameters and the engine version', () => {
    expect(initialState()).toStrictEqual({
      version: 1,
      engineVersion: ENGINE_VERSION,
      configHash: STRATEGY.configHash,
      runHash: RUN.runHash,
      signal: { leadInCandles: 3, processedCandles: 0, lastCandleOpenTime: null, indicators: {} },
      wallet: {
        keyPrefix: '',
        lastCandleOpenTime: null,
        firstSignalCandleOpenTime: null,
        sequence: 0,
        isHalted: false,
        cash: '10000',
        position: null,
        pendingOrder: null,
        benchmark: null,
      },
    });
  });

  test('round-trips through canonical JSON byte for byte', () => {
    const base = initialState();
    const state = {
      ...base,
      signal: { ...base.signal, indicators: { 'risk:atr': { value: 0.1 + 0.2 } } },
    };
    const text = serializeEngineState(state);
    expect(text.startsWith('{"configHash":')).toBe(true);
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

  test('accepts the valid shapes the invariants allow', () => {
    for (const valid of [
      withWallet({ position: OPEN_POSITION }),
      withWallet({ pendingOrder: PENDING_BUY }),
      withWallet({ position: OPEN_POSITION, pendingOrder: PENDING_SELL }),
      withWallet({
        pendingOrder: { ...PENDING_BUY, type: 'limit', limitPrice: '99', eligibleCandles: 2 },
      }),
      tradingState(3),
    ]) {
      expect(() => serializeEngineState(valid)).not.toThrow();
    }
  });

  test('rejects every state that breaks an invariant (R4)', () => {
    const broken: readonly (readonly [string, EngineState])[] = [
      ['entrada com posição', withWallet({ position: OPEN_POSITION, pendingOrder: PENDING_BUY })],
      ['saída sem posição', withWallet({ pendingOrder: PENDING_SELL })],
      [
        'processado sem tempo',
        { ...initialState(), signal: { ...initialState().signal, processedCandles: 1 } },
      ],
      ['caixa negativo', withWallet({ cash: '-0.01' })],
      ['quantidade zero', withWallet({ position: { ...OPEN_POSITION, quantity: '0' } })],
      ['stop acima da entrada', withWallet({ position: { ...OPEN_POSITION, stopPrice: '101' } })],
      [
        'alvo abaixo da entrada',
        withWallet({ position: { ...OPEN_POSITION, targetPrice: '100' } }),
      ],
      [
        'limitada sem preço',
        withWallet({ pendingOrder: { ...PENDING_BUY, type: 'limit', eligibleCandles: 2 } }),
      ],
      [
        'mercado com validade',
        withWallet({ pendingOrder: { ...PENDING_BUY, eligibleCandles: 2 } }),
      ],
      ['entrada sem risco', withWallet({ pendingOrder: { ...PENDING_BUY, riskAmount: null } })],
      [
        'saída sem motivo',
        withWallet({
          position: OPEN_POSITION,
          pendingOrder: { ...PENDING_SELL, exitReason: null },
        }),
      ],
      ['decimal com zero à esquerda', withWallet({ cash: '00.10' })],
      ['decimal com zero à direita', withWallet({ cash: '1.0' })],
      ['zero negativo', withWallet({ position: { ...OPEN_POSITION, entryFee: '-0' } })],
      [
        'régua sem aquecimento',
        {
          ...tradingState(3),
          wallet: { ...tradingState(3).wallet, benchmark: { quantity: '1', cash: '1' } },
        },
      ],
      ['régua faltando depois do aquecimento', withWallet({ benchmark: null })],
      ['metades em candles diferentes', withWallet({ lastCandleOpenTime: 1 })],
      [
        'sinal antes do aquecimento',
        { ...tradingState(2), wallet: { ...tradingState(2).wallet, firstSignalCandleOpenTime: 0 } },
      ],
      ['prefixo de chave inválido', withWallet({ keyPrefix: 'W 3' })],
    ];
    for (const [label, state] of broken) {
      const error = captureStateError(() => serializeEngineState(state));
      expect([label, error.code]).toStrictEqual([label, ENGINE_STATE_ERROR_CODE.INVALID_STATE]);
    }
  });

  test('never serializes something that would not come back the same', () => {
    const base = initialState();
    const withMap = {
      ...base,
      signal: { ...base.signal, indicators: { cache: new Map() } },
    } as unknown as EngineState;
    const withDecimal = {
      ...base,
      wallet: { ...base.wallet, cash: new EngineDecimal('1') },
    } as unknown as EngineState;
    const withUndefined = {
      ...base,
      wallet: { ...base.wallet, benchmark: undefined },
    } as unknown as EngineState;
    for (const broken of [withMap, withDecimal, withUndefined]) {
      expect(() => serializeEngineState(broken)).toThrow(EngineStateError);
    }
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
