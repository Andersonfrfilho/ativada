// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createInitialWalletState,
  ENGINE_INPUT_ERROR_CODE,
  RISK_ATR_INDICATOR_ID,
  type EngineCandle,
  type EngineCommand,
  type EngineInputErrorCode,
  type SignalAction,
  type SignalDecision,
  type WalletState,
  type WalletStepInput,
} from '../../../../packages/strategy-engine/src/index.js';
import {
  buildCandles,
  buildReferenceRun,
  buildReferenceStrategy,
  MARKET_ENTRY,
  QUIET_CANDLE,
  type CandleSpec,
} from '../engine-scenarios.fixture.js';

export const GUARD_STRATEGY = buildReferenceStrategy(MARKET_ENTRY);
export const GUARD_RUN = buildReferenceRun();
const GUARD_SPECS: readonly CandleSpec[] = [QUIET_CANDLE, QUIET_CANDLE, QUIET_CANDLE, QUIET_CANDLE];
const WRONG_CONFIG_HASH = 'f'.repeat(64);
const WRONG_RUN_HASH = 'e'.repeat(64);

export function guardCandle(index: number): EngineCandle {
  const candle = buildCandles(GUARD_SPECS)[index];
  if (candle === undefined) throw new Error('Candle ausente.');
  return candle;
}

export function guardSignal(params: {
  readonly candle: EngineCandle;
  readonly action: SignalAction;
  readonly gap?: number;
  readonly configHash?: string;
}): SignalDecision {
  return {
    candleOpenTime: params.candle.openTime,
    configHash: params.configHash ?? GUARD_STRATEGY.configHash,
    confirmedGapCandles: params.gap ?? 0,
    action: params.action,
    score: '0',
    regime: 'none',
    votes: [],
    indicators: { [RISK_ATR_INDICATOR_ID]: 2 },
    sentiment: null,
    reason: 'teste',
  };
}

export function guardStateAfterFirst(): WalletState {
  return {
    ...createInitialWalletState({ strategy: GUARD_STRATEGY, run: GUARD_RUN }),
    lastCandleOpenTime: guardCandle(0).openTime,
  };
}

// A entrada boa: o candle seguinte ao último da carteira, com o sinal da mesma estratégia.
export function guardInput(overrides: Partial<WalletStepInput> = {}): WalletStepInput {
  const candle = guardCandle(1);
  return {
    strategy: GUARD_STRATEGY,
    run: GUARD_RUN,
    state: guardStateAfterFirst(),
    candle,
    signal: guardSignal({ candle, action: 'HOLD' }),
    ...overrides,
  };
}

export type WalletGuardCase = {
  readonly label: string;
  readonly code: EngineInputErrorCode;
  readonly input: WalletStepInput;
};

function command(overrides: Partial<EngineCommand>): EngineCommand {
  return {
    commandId: 'c-1',
    issuedAt: guardCandle(1).openTime,
    kind: 'halt',
    reason: 'user_stop',
    ...overrides,
  };
}

const EXTERNAL_REPORT = {
  kind: 'position_closed_externally',
  reportId: 'report-1',
  reportedAt: 0,
  positionKey: 'position-0',
  price: '100',
  quantity: '1',
  fee: '0.1',
} as const;

// Cada recusa do `walletStep` avulso, com o código que o chamador ramifica.
export function buildWalletGuardCases(): readonly WalletGuardCase[] {
  const code = ENGINE_INPUT_ERROR_CODE;
  const second = guardCandle(1);
  const third = guardCandle(2);
  const cases: readonly (readonly [string, EngineInputErrorCode, Partial<WalletStepInput>])[] = [
    [
      'estado de outra estratégia',
      code.CONFIG_HASH_MISMATCH,
      { state: { ...guardStateAfterFirst(), configHash: WRONG_CONFIG_HASH } },
    ],
    [
      'estratégia de outro hash',
      code.CONFIG_HASH_MISMATCH,
      { strategy: { ...GUARD_STRATEGY, configHash: WRONG_CONFIG_HASH } },
    ],
    [
      'sinal de outra estratégia',
      code.CONFIG_HASH_MISMATCH,
      { signal: guardSignal({ candle: second, action: 'BUY', configHash: WRONG_CONFIG_HASH }) },
    ],
    [
      'estado de outros parâmetros',
      code.RUN_HASH_MISMATCH,
      { state: { ...guardStateAfterFirst(), runHash: WRONG_RUN_HASH } },
    ],
    [
      'outros parâmetros',
      code.RUN_HASH_MISMATCH,
      { run: { ...GUARD_RUN, runHash: WRONG_RUN_HASH } },
    ],
    [
      'candle repetido',
      code.CANDLE_ALREADY_PROCESSED,
      {
        candle: guardCandle(0),
        signal: guardSignal({ candle: guardCandle(0), action: 'HOLD' }),
      },
    ],
    [
      'candle fora de ordem',
      code.CANDLE_OUT_OF_ORDER,
      { state: { ...guardStateAfterFirst(), lastCandleOpenTime: third.openTime } },
    ],
    [
      'lacuna sem confirmação',
      code.CANDLE_GAP_UNCONFIRMED,
      { candle: third, signal: guardSignal({ candle: third, action: 'HOLD' }) },
    ],
    [
      'lacuna declarada errada',
      code.CANDLE_GAP_UNCONFIRMED,
      { candle: third, signal: guardSignal({ candle: third, action: 'HOLD', gap: 2 }) },
    ],
    ['lacuna sem sinal para ecoá-la', code.CANDLE_GAP_UNCONFIRMED, { candle: third, signal: null }],
    [
      'lacuna declarada onde não há',
      code.CANDLE_GAP_UNCONFIRMED,
      { signal: guardSignal({ candle: second, action: 'HOLD', gap: 1 }) },
    ],
    ['outro par', code.CANDLE_WRONG_MARKET, { candle: { ...second, symbol: 'ETHUSDT' } }],
    ['preço zero', code.CANDLE_INSANE, { candle: { ...second, low: '0' } }],
    [
      'sinal de outro candle',
      code.SIGNAL_MISMATCH,
      { signal: guardSignal({ candle: guardCandle(0), action: 'HOLD' }) },
    ],
    [
      'comando do futuro',
      code.COMMAND_INVALID,
      { commands: [command({ issuedAt: second.closeTime + 1 })] },
    ],
    [
      'comando repetido',
      code.COMMAND_INVALID,
      { commands: [command({}), command({ kind: 'resume', reason: 'user_resume' })] },
    ],
    [
      'relatório da corretora',
      code.EXECUTION_REPORTS_UNSUPPORTED,
      { executionReports: [{ ...EXTERNAL_REPORT, reportedAt: second.openTime }] },
    ],
  ];
  return cases.map(([label, expected, overrides]) => ({
    label,
    code: expected,
    input: guardInput(overrides),
  }));
}

// A entrada que DEVE passar: lacuna confirmada ecoada pelo sinal.
export function buildEchoedGapInput(): WalletStepInput {
  const third = guardCandle(2);
  return guardInput({
    candle: third,
    signal: guardSignal({ candle: third, action: 'HOLD', gap: 1 }),
  });
}
