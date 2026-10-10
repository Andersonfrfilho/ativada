// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createInitialWalletState,
  EngineInputError,
  RISK_ATR_INDICATOR_ID,
  walletStep,
  type EngineCandle,
  type EngineCommand,
  type EngineInputErrorCode,
  type SignalAction,
  type SignalDecision,
  type WalletState,
  type WalletStepInput,
} from '../packages/strategy-engine/src/index.js';
import {
  buildCandles,
  buildReferenceRun,
  buildReferenceStrategy,
  LIMIT_ENTRY,
  MARKET_ENTRY,
  QUIET_CANDLE,
  type CandleSpec,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  buildEchoedGapInput,
  buildWalletGuardCases,
} from './fixtures/strategy-engine/production/wallet-guard-cases.fixture.js';

const STRATEGY = buildReferenceStrategy(MARKET_ENTRY);
const LIMIT_STRATEGY = buildReferenceStrategy(LIMIT_ENTRY);
const RUN = buildReferenceRun();

function candleAt(specs: readonly CandleSpec[], index: number): EngineCandle {
  const candle = buildCandles(specs)[index];
  if (candle === undefined) throw new Error('Candle ausente.');
  return candle;
}

function signalOf(params: {
  readonly candle: EngineCandle;
  readonly action: SignalAction;
  readonly atr?: number | null;
  readonly gap?: number;
  readonly configHash?: string;
}): SignalDecision {
  return {
    candleOpenTime: params.candle.openTime,
    configHash: params.configHash ?? STRATEGY.configHash,
    confirmedGapCandles: params.gap ?? 0,
    action: params.action,
    score: '0',
    regime: 'none',
    votes: [],
    indicators: { [RISK_ATR_INDICATOR_ID]: params.atr === undefined ? 2 : params.atr },
    sentiment: null,
    reason: 'teste',
  };
}

function codeOf(run: () => unknown): EngineInputErrorCode | 'aceito' {
  try {
    run();
    return 'aceito';
  } catch (error) {
    if (error instanceof EngineInputError) return error.code;
    throw error;
  }
}

const SPECS: readonly CandleSpec[] = [QUIET_CANDLE, QUIET_CANDLE, QUIET_CANDLE, QUIET_CANDLE];

function afterFirst(): WalletState {
  return {
    ...createInitialWalletState({ strategy: STRATEGY, run: RUN }),
    lastCandleOpenTime: candleAt(SPECS, 0).openTime,
  };
}

function input(overrides: Partial<WalletStepInput> = {}): WalletStepInput {
  const candle = candleAt(SPECS, 1);
  return {
    strategy: STRATEGY,
    run: RUN,
    state: afterFirst(),
    candle,
    signal: signalOf({ candle, action: 'HOLD' }),
    ...overrides,
  };
}

describe('walletStep standalone: refuses what the composed step already checked for it', () => {
  test('accepts the next candle with a signal of the same strategy', () => {
    expect(codeOf(() => walletStep(input()))).toBe('aceito');
  });

  test('every refusal carries a stable code', () => {
    for (const guard of buildWalletGuardCases()) {
      expect([guard.label, codeOf(() => walletStep(guard.input))]).toStrictEqual([
        guard.label,
        guard.code,
      ]);
    }
  });

  test('a forward gap passes when the signal echoes the exact count of missing candles', () => {
    expect(codeOf(() => walletStep(buildEchoedGapInput()))).toBe('aceito');
  });
});

describe('walletStep: the signal and command policy by hand', () => {
  const FILL_SPECS: readonly CandleSpec[] = [
    QUIET_CANDLE,
    QUIET_CANDLE,
    QUIET_CANDLE,
    QUIET_CANDLE,
  ];

  function run(actions: readonly SignalAction[], strategy = STRATEGY): WalletStepInput['state'][] {
    let state = createInitialWalletState({ strategy, run: RUN });
    const states: WalletState[] = [];
    actions.forEach((action, index) => {
      const candle = candleAt(FILL_SPECS, index);
      const result = walletStep({
        strategy,
        run: RUN,
        state,
        candle,
        signal: { ...signalOf({ candle, action }), configHash: strategy.configHash },
      });
      state = result.state;
      states.push(state);
    });
    return states;
  }

  test('BUY with a free wallet creates one entry for t+1; BUY with it open is ignored', () => {
    const [afterBuy, afterSecond, afterThird] = run(['BUY', 'BUY', 'BUY']);
    expect(afterBuy?.pendingOrder?.purpose).toBe('entry');
    expect(afterSecond?.position?.positionKey).toBe('position-1');
    expect(afterSecond?.pendingOrder).toBeNull();
    expect(afterThird?.pendingOrder).toBeNull();
    expect(afterThird?.sequence).toBe(2);
  });

  test('SELL cancels a live limit entry, sells an open position at t+1 and does nothing when idle', () => {
    expect(run(['SELL'])[0]?.pendingOrder).toBeNull();
    const [, cancelled] = run(['BUY', 'SELL'], LIMIT_STRATEGY);
    expect(cancelled?.pendingOrder).toBeNull();
    const [, , selling, sold] = run(['BUY', 'HOLD', 'SELL', 'HOLD']);
    expect(selling?.pendingOrder).toMatchObject({ purpose: 'exit', exitReason: 'signal' });
    expect(sold?.position).toBeNull();
    expect(sold?.pendingOrder).toBeNull();
  });

  test('HOLD never creates anything', () => {
    expect(run(['HOLD', 'HOLD']).every((state) => state.pendingOrder === null)).toBe(true);
  });

  test('halt cancels the live entry and blocks BUY; resume lets it enter again', () => {
    const candle = candleAt(FILL_SPECS, 1);
    const live = run(['BUY'], LIMIT_STRATEGY)[0];
    if (live === undefined) throw new Error('Estado ausente.');
    const halt: EngineCommand = {
      commandId: 'halt-1',
      issuedAt: candle.openTime,
      kind: 'halt',
      reason: 'user_stop',
    };
    const halted = walletStep({
      strategy: LIMIT_STRATEGY,
      run: RUN,
      state: live,
      candle,
      signal: { ...signalOf({ candle, action: 'BUY' }), configHash: LIMIT_STRATEGY.configHash },
      commands: [halt],
    });
    expect(halted.state.isHalted).toBe(true);
    expect(halted.state.pendingOrder).toBeNull();
    expect(halted.decisions.orders.map((order) => `${order.status}:${order.reason}`)).toStrictEqual(
      ['cancelled:command'],
    );
    expect(halted.decisions.commands).toStrictEqual([
      {
        commandId: 'halt-1',
        candleOpenTime: candle.openTime,
        issuedAt: candle.openTime,
        kind: 'halt',
        reason: 'user_stop',
      },
    ]);
  });

  test('exit_position sells the open position at t+1 and only cancels when there is none', () => {
    const [, , open] = run(['BUY', 'HOLD', 'HOLD']);
    if (open === undefined) throw new Error('Estado ausente.');
    const candle = candleAt([...FILL_SPECS, QUIET_CANDLE], 3);
    const exit: EngineCommand = {
      commandId: 'exit-1',
      issuedAt: candle.openTime,
      kind: 'exit_position',
      reason: 'goal_reached',
    };
    const base = { strategy: STRATEGY, run: RUN, candle, commands: [exit] };
    const withPosition = walletStep({
      ...base,
      state: open,
      signal: signalOf({ candle, action: 'HOLD' }),
    });
    expect(withPosition.state.pendingOrder).toMatchObject({
      purpose: 'exit',
      exitReason: 'command',
    });
    const idle = createInitialWalletState({ strategy: STRATEGY, run: RUN });
    const withoutPosition = walletStep({
      ...base,
      state: { ...idle, lastCandleOpenTime: candleAt(SPECS, 2).openTime },
      signal: signalOf({ candle, action: 'HOLD', gap: 0 }),
    });
    expect(withoutPosition.state.pendingOrder).toBeNull();
  });

  test('the same input twice gives the same output (a redelivered command is not applied twice)', () => {
    const candle = candleAt(SPECS, 1);
    const command: EngineCommand = {
      commandId: 'once',
      issuedAt: candle.openTime,
      kind: 'halt',
      reason: 'user_stop',
    };
    const same = input({ commands: [command] });
    expect(JSON.stringify(walletStep(same))).toBe(JSON.stringify(walletStep(same)));
  });
});

describe('walletStep: the buy-and-hold benchmark and the equity point by hand', () => {
  test('the benchmark buys at the open after the first signal and is marked at the close', () => {
    const [first, second] = [candleAt(SPECS, 0), candleAt(SPECS, 1)];
    if (first === undefined || second === undefined) throw new Error('Candle ausente.');
    const start = createInitialWalletState({ strategy: STRATEGY, run: RUN });
    const afterFirst = walletStep({
      strategy: STRATEGY,
      run: RUN,
      state: start,
      candle: first,
      signal: signalOf({ candle: first, action: 'HOLD' }),
    });
    expect(afterFirst.state.benchmark).toBeNull();
    expect(afterFirst.decisions.equityPoint).toStrictEqual({
      candleOpenTime: first.openTime,
      equity: '10000',
      equityAtLow: '10000',
      benchmark: '10000',
    });
    const afterSecond = walletStep({
      strategy: STRATEGY,
      run: RUN,
      state: afterFirst.state,
      candle: second,
      signal: signalOf({ candle: second, action: 'HOLD' }),
    });
    // Orçamento 10000 ÷ 1,001 = 9990,00999; P = 100,05 → 99,85017; débito 9990,0095085 + taxa 9,99000951.
    expect(afterSecond.state.benchmark).toStrictEqual({ quantity: '99.85017', cash: '0.00048199' });
    // Fechamento 100 → venda a 99,95: 99,85017 × 99,95 = 9980,0244915; taxa 9,9800245; + 0,00048199.
    expect(afterSecond.decisions.equityPoint?.benchmark).toBe('9970.04494899');
  });

  test('without a signal (lead-in) there is no equity point and no benchmark', () => {
    const first = candleAt(SPECS, 0);
    const result = walletStep({
      strategy: STRATEGY,
      run: RUN,
      state: createInitialWalletState({ strategy: STRATEGY, run: RUN }),
      candle: first,
      signal: null,
    });
    expect(result.decisions.equityPoint).toBeNull();
    expect(result.state.firstSignalCandleOpenTime).toBeNull();
    expect(result.state.lastCandleOpenTime).toBe(first.openTime);
  });
});
