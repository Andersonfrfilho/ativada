// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createInitialWalletState,
  walletStep,
  type EngineCommand,
  type WalletState,
} from '../packages/strategy-engine/src/index.js';
import {
  carriedWallet,
  handCommand,
  handStep,
  HAND_RUN,
  HAND_STRATEGY,
  MARKET_ENTRY_ORDER,
} from './fixtures/strategy-engine/production/hand-wallet.fixture.js';
import {
  guardCandle,
  guardSignal,
  guardStateAfterFirst,
} from './fixtures/strategy-engine/production/wallet-guard-cases.fixture.js';

const CANDLE: readonly [string, string, string, string] = ['100', '101', '99', '100'];
const CLOSE_OPEN_TIME = guardCandle(1).openTime;
const MAXIMUM_REMEMBERED_COMMANDS = 64;
const LIVE_LIMIT_ENTRY = {
  ...MARKET_ENTRY_ORDER,
  type: 'limit',
  limitPrice: '99',
  eligibleCandles: 2,
} as const;

function hasEntry(orders: readonly { readonly purpose: string }[]): boolean {
  return orders.some((order) => order.purpose === 'entry');
}

describe('exit_position and halt suppress any new entry in their candle (ADR 0002 §h)', () => {
  test('exit_position without a position only cancels the pending entry: a BUY in the same candle does not enter', () => {
    const result = handStep({
      state: { pendingOrder: LIVE_LIMIT_ENTRY },
      candle: ['100', '101', '99.5', '100'],
      action: 'BUY',
      commands: [handCommand('exit_position', 'c-1', CLOSE_OPEN_TIME)],
    });
    expect(result.decisions.orders.map((order) => `${order.status}:${order.reason}`)).toEqual([
      'cancelled:command',
    ]);
    expect(hasEntry(result.decisions.orders.filter((order) => order.status === 'created'))).toBe(
      false,
    );
    expect(result.state.pendingOrder).toBeNull();
  });

  test('exit_position on a free wallet still lets nothing in with a BUY', () => {
    const result = handStep({
      state: {},
      candle: CANDLE,
      action: 'BUY',
      commands: [handCommand('exit_position', 'c-1', CLOSE_OPEN_TIME)],
    });
    expect(result.decisions.orders).toStrictEqual([]);
  });

  test('halt and resume in the same candle still suppress the entry', () => {
    const result = handStep({
      state: {},
      candle: CANDLE,
      action: 'BUY',
      commands: [
        handCommand('halt', 'c-1', CLOSE_OPEN_TIME),
        handCommand('resume', 'c-2', CLOSE_OPEN_TIME),
      ],
    });
    expect(result.decisions.orders).toStrictEqual([]);
    expect(result.state.isHalted).toBe(false);
  });

  test('exit_position with an open position sells it at the next open and a BUY is ignored', () => {
    const result = handStep({
      state: carriedWallet(),
      candle: CANDLE,
      action: 'BUY',
      commands: [handCommand('exit_position', 'c-1', CLOSE_OPEN_TIME)],
    });
    expect(result.decisions.orders.map((order) => `${order.purpose}:${order.status}`)).toEqual([
      'exit:created',
    ]);
  });

  test('a resume alone does not suppress: the BUY enters (control)', () => {
    const result = handStep({
      state: { isHalted: true },
      candle: CANDLE,
      action: 'BUY',
      commands: [handCommand('resume', 'c-1', CLOSE_OPEN_TIME)],
    });
    expect(hasEntry(result.decisions.orders)).toBe(true);
  });
});

function nextStep(
  state: WalletState,
  commands: readonly EngineCommand[],
): ReturnType<typeof walletStep> {
  const candle = guardCandle(2);
  return walletStep({
    strategy: HAND_STRATEGY,
    run: HAND_RUN,
    state,
    candle,
    signal: guardSignal({ candle, action: 'HOLD' }),
    commands,
  });
}

describe('a commandId already processed is ignored in a later step (idempotency across steps)', () => {
  test('the repeat is recorded as ignored_duplicate and changes nothing', () => {
    const candle = guardCandle(1);
    const first = walletStep({
      strategy: HAND_STRATEGY,
      run: HAND_RUN,
      state: guardStateAfterFirst(),
      candle,
      signal: guardSignal({ candle, action: 'HOLD' }),
      commands: [handCommand('halt', 'c-1', candle.openTime)],
    });
    expect(first.decisions.commands[0]).toMatchObject({ commandId: 'c-1', status: 'applied' });
    expect(first.state.isHalted).toBe(true);
    expect(first.state.processedCommandIds).toStrictEqual(['c-1']);
    const again = nextStep(first.state, [handCommand('resume', 'c-1', guardCandle(2).openTime)]);
    expect(again.decisions.commands).toHaveLength(1);
    expect(again.decisions.commands[0]).toMatchObject({
      commandId: 'c-1',
      status: 'ignored_duplicate',
    });
    expect(again.state.isHalted).toBe(true);
    expect(again.state.processedCommandIds).toStrictEqual(['c-1']);
  });

  test('only the last 64 identifiers are remembered, oldest out first', () => {
    const remembered = Array.from(
      { length: MAXIMUM_REMEMBERED_COMMANDS },
      (_unused, i) => `old-${i}`,
    );
    const state: WalletState = {
      ...createInitialWalletState({ strategy: HAND_STRATEGY, run: HAND_RUN }),
      lastCandleOpenTime: guardCandle(1).openTime,
      processedCommandIds: remembered,
    };
    const result = nextStep(state, [handCommand('resume', 'new', guardCandle(2).openTime)]);
    expect(result.state.processedCommandIds).toHaveLength(MAXIMUM_REMEMBERED_COMMANDS);
    expect(result.state.processedCommandIds[0]).toBe('old-1');
    expect(result.state.processedCommandIds.at(-1)).toBe('new');
    const rewound = { ...result.state, lastCandleOpenTime: guardCandle(1).openTime };
    const evicted = nextStep(rewound, [handCommand('halt', 'old-0', guardCandle(2).openTime)]);
    expect(evicted.decisions.commands[0]).toMatchObject({ status: 'applied' });
    const kept = nextStep(rewound, [handCommand('halt', 'old-1', guardCandle(2).openTime)]);
    expect(kept.decisions.commands[0]).toMatchObject({ status: 'ignored_duplicate' });
  });
});
