// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  assertStepInput,
  assertWalletStepInput,
  createInitialEngineState,
  ENGINE_INPUT_ERROR_CODE,
  ENGINE_STATE_ERROR_CODE,
  EngineInputError,
  EngineStateError,
  resolveFreshSentiment,
  selectAvailableSentiment,
  SENTIMENT_STALE_AFTER_MILLISECONDS,
  type EngineInputErrorCode,
  type EngineState,
  type SignalDecision,
  type StepInput,
} from '../packages/strategy-engine/src/index.js';
import {
  buildCandles,
  buildReferenceRun,
  buildReferenceStrategy,
  QUIET_CANDLE,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';

const ENGINE_VERSION = 'contract-test-1';
const STRATEGY = buildReferenceStrategy({ orderType: 'market' });
const RUN = buildReferenceRun();
const [FIRST, SECOND, THIRD] = buildCandles([QUIET_CANDLE, QUIET_CANDLE, QUIET_CANDLE]);

function requireCandle<TValue>(value: TValue | undefined): TValue {
  if (value === undefined) throw new Error('Candle ausente.');
  return value;
}

function initialState(): EngineState {
  return createInitialEngineState({
    strategy: STRATEGY,
    run: RUN,
    engineVersion: ENGINE_VERSION,
    leadInCandles: 3,
  });
}

function afterFirst(): EngineState {
  const state = initialState();
  const lastCandleOpenTime = requireCandle(FIRST).openTime;
  return {
    ...state,
    signal: { ...state.signal, processedCandles: 1, lastCandleOpenTime },
    wallet: { ...state.wallet, lastCandleOpenTime },
  };
}

function stepInput(overrides: Partial<StepInput>): StepInput {
  return {
    strategy: STRATEGY,
    run: RUN,
    state: afterFirst(),
    candle: requireCandle(SECOND),
    ...overrides,
  };
}

function codeOf(run: () => void): EngineInputErrorCode | 'aceito' {
  try {
    run();
    return 'aceito';
  } catch (error) {
    if (error instanceof EngineInputError) return error.code;
    throw error;
  }
}

describe('step input guard', () => {
  test('accepts the next candle and a sentiment available exactly at the close', () => {
    const candle = requireCandle(SECOND);
    const sentiment = { value: 40, observedAt: candle.closeTime, source: 'alternative.me' };
    expect(
      codeOf(() =>
        assertStepInput({ input: stepInput({ sentiment }), engineVersion: ENGINE_VERSION }),
      ),
    ).toBe('aceito');
  });

  test('every refusal carries a stable code the caller can branch on', () => {
    const second = requireCandle(SECOND);
    const third = requireCandle(THIRD);
    const code = ENGINE_INPUT_ERROR_CODE;
    const sentiment = { value: 40, observedAt: second.closeTime, source: 'alternative.me' };
    const cases: readonly (readonly [EngineInputErrorCode, Partial<StepInput>])[] = [
      [code.CONFIG_HASH_MISMATCH, { strategy: { ...STRATEGY, configHash: 'f'.repeat(64) } }],
      [code.RUN_HASH_MISMATCH, { run: { ...RUN, runHash: 'e'.repeat(64) } }],
      [code.CANDLE_WRONG_MARKET, { candle: { ...second, symbol: 'ETHUSDT' } }],
      [code.CANDLE_WRONG_MARKET, { candle: { ...second, timeframe: '4h' } }],
      [
        code.CANDLE_OFF_GRID,
        { candle: { ...second, openTime: second.openTime + 1, closeTime: second.closeTime + 1 } },
      ],
      [code.CANDLE_INSANE, { candle: { ...second, close: '0' } }],
      [code.CANDLE_INSANE, { candle: { ...second, high: '98' } }],
      [code.CANDLE_INSANE, { candle: { ...second, volume: '1,5' } }],
      [code.CANDLE_INSANE, { candle: { ...second, openTime: -3_600_000, closeTime: -1 } }],
      [code.CANDLE_ALREADY_PROCESSED, { candle: requireCandle(FIRST) }],
      [
        code.CANDLE_OUT_OF_ORDER,
        {
          state: {
            ...afterFirst(),
            signal: { ...afterFirst().signal, lastCandleOpenTime: third.openTime },
            wallet: { ...afterFirst().wallet, lastCandleOpenTime: third.openTime },
          },
          candle: second,
        },
      ],
      [code.CANDLE_GAP_UNCONFIRMED, { candle: third }],
      [code.CANDLE_GAP_UNCONFIRMED, { candle: second, confirmedGapCandles: 1 }],
      [code.CANDLE_GAP_UNCONFIRMED, { candle: third, confirmedGapCandles: -1 }],
      [code.SENTIMENT_INVALID, { sentiment: { ...sentiment, value: Number.NaN } }],
      [code.SENTIMENT_INVALID, { sentiment: { ...sentiment, value: -1 } }],
      [code.SENTIMENT_INVALID, { sentiment: { ...sentiment, source: '' } }],
      [
        code.SENTIMENT_FROM_FUTURE,
        { sentiment: { ...sentiment, observedAt: second.closeTime + 1 } },
      ],
      [
        code.COMMAND_INVALID,
        {
          commands: [
            { commandId: 'c', issuedAt: second.closeTime + 1, kind: 'halt', reason: 'user_stop' },
          ],
        },
      ],
    ];
    for (const [expected, overrides] of cases) {
      const received = codeOf(() =>
        assertStepInput({ input: stepInput(overrides), engineVersion: ENGINE_VERSION }),
      );
      expect([expected, received]).toStrictEqual([expected, expected]);
    }
  });

  test('a forward gap passes only when the caller declares the exact count', () => {
    const input = stepInput({ candle: requireCandle(THIRD), confirmedGapCandles: 1 });
    expect(codeOf(() => assertStepInput({ input, engineVersion: ENGINE_VERSION }))).toBe('aceito');
  });

  test('refuses a state written by another engine version', () => {
    try {
      assertStepInput({ input: stepInput({}), engineVersion: 'other-2' });
      throw new Error('Deveria recusar.');
    } catch (error) {
      expect(error).toBeInstanceOf(EngineStateError);
      expect((error as EngineStateError).code).toBe(ENGINE_STATE_ERROR_CODE.ENGINE_MISMATCH);
    }
  });

  test('the wallet half refuses a signal stamped on another candle', () => {
    const second = requireCandle(SECOND);
    const signal = { candleOpenTime: second.openTime - 1 } as SignalDecision;
    const received = codeOf(() =>
      assertWalletStepInput({
        strategy: STRATEGY,
        run: RUN,
        state: afterFirst().wallet,
        candle: second,
        signal,
      }),
    );
    expect(received).toBe(ENGINE_INPUT_ERROR_CODE.SIGNAL_MISMATCH);
  });
});

describe('sentiment availability and freshness', () => {
  const closeTime = requireCandle(SECOND).closeTime;
  const source = 'alternative.me';
  const insertionCutoff = closeTime + 1_000;
  const older = { value: 20, observedAt: closeTime - 10, source, createdAt: closeTime - 10 };
  const newer = { value: 80, observedAt: closeTime, source, createdAt: closeTime };
  const future = { value: 99, observedAt: closeTime + 1, source, createdAt: closeTime + 1 };

  test('the caller hands over the latest observation already available at the close', () => {
    const selected = selectAvailableSentiment({
      observations: [older, newer, future],
      closeTime,
      source,
      insertionCutoff,
    });
    expect(selected).toStrictEqual({ value: 80, observedAt: closeTime, source });
    expect(
      selectAvailableSentiment({ observations: [future], closeTime, source, insertionCutoff }),
    ).toBeUndefined();
  });

  test('exactly 48 h old is still fresh; one millisecond more is missing data', () => {
    const atLimit = { ...older, observedAt: closeTime - SENTIMENT_STALE_AFTER_MILLISECONDS };
    const pastLimit = { ...older, observedAt: atLimit.observedAt - 1 };
    expect(resolveFreshSentiment({ sentiment: atLimit, closeTime })).toBe(atLimit);
    expect(resolveFreshSentiment({ sentiment: pastLimit, closeTime })).toBeNull();
    expect(resolveFreshSentiment({ sentiment: undefined, closeTime })).toBeNull();
  });
});
