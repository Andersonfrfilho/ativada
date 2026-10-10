// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createInitialWalletState,
  walletStep,
  type EngineCommand,
  type OpenPositionState,
  type RunSetup,
  type PendingOrderState,
  type SignalAction,
  type StrategyVersion,
  type WalletState,
  type WalletStepResult,
} from '../../../../packages/strategy-engine/src/index.js';
import {
  buildCandles,
  buildReferenceRun,
  buildReferenceStrategy,
  MARKET_ENTRY,
  QUIET_CANDLE,
  type CandleSpec,
} from '../engine-scenarios.fixture.js';
import { guardSignal } from './wallet-guard-cases.fixture.js';

// Contas feitas à mão: tick 0,01, passo 0,00001, taxa 0,1%, slippage 0,05%, mínimo 5, saldo 10 000,
// risco 1% (valor em risco 100), stop 2×ATR, alvo 3×ATR com ATR 2 (distâncias 4 e 6).
export const HAND_STRATEGY = buildReferenceStrategy(MARKET_ENTRY);
export const HAND_RUN = buildReferenceRun();
export const DECISION_CANDLE: CandleSpec = ['100', '101', '99', '100'];
export const DECISION_OPEN_TIME = buildCandles([DECISION_CANDLE])[0]?.openTime ?? 0;

export const MARKET_ENTRY_ORDER: PendingOrderState = {
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

export const PENDING_SIGNAL_EXIT: PendingOrderState = {
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

// P = 100,05; stop 96,05; alvo 106,05; 23,5513 unidades; taxa 2,35630757; caixa 7641,33612743.
export const CARRIED_POSITION: OpenPositionState = {
  positionKey: 'position-0',
  openedCandleOpenTime: DECISION_OPEN_TIME,
  entryPrice: '100.05',
  quantity: '23.5513',
  stopPrice: '96.05',
  targetPrice: '106.05',
  entryFee: '2.35630757',
};
export const CASH_AFTER_ENTRY = '7641.33612743';

export function carriedWallet(overrides: Partial<WalletState> = {}): Partial<WalletState> {
  return { cash: CASH_AFTER_ENTRY, position: CARRIED_POSITION, ...overrides };
}

export type HandStepParams = {
  readonly state: Partial<WalletState>;
  readonly candle: CandleSpec;
  readonly action?: SignalAction | null;
  readonly commands?: readonly EngineCommand[];
  readonly gapCandles?: number;
  readonly strategy?: StrategyVersion;
  readonly run?: RunSetup;
  // Executa o passo; o padrão é o `walletStep` de produção (o juiz de mutantes passa o da cópia mutada).
  readonly walletStepImplementation?: typeof walletStep;
};

// Um `walletStep` AVULSO sobre o candle seguinte ao de decisão (ou depois de `gapCandles` ausentes).
export function handStep(params: HandStepParams): WalletStepResult {
  const strategy = params.strategy ?? HAND_STRATEGY;
  const run = params.run ?? HAND_RUN;
  const execute = params.walletStepImplementation ?? walletStep;
  const gapCandles = params.gapCandles ?? 0;
  const fillers = Array.from({ length: gapCandles }, () => QUIET_CANDLE);
  const candle = buildCandles([DECISION_CANDLE, ...fillers, params.candle]).at(-1);
  if (candle === undefined) throw new Error('Candle ausente.');
  const action = params.action === undefined ? 'HOLD' : params.action;
  return execute({
    strategy,
    run,
    state: {
      ...createInitialWalletState({ strategy, run }),
      lastCandleOpenTime: DECISION_OPEN_TIME,
      ...params.state,
    },
    candle,
    signal: action === null ? null : guardSignal({ candle, action, gap: gapCandles }),
    commands: params.commands ?? [],
  });
}

export function handCommand(
  kind: EngineCommand['kind'],
  commandId: string,
  candleOpenTime: number,
): EngineCommand {
  const reason = kind === 'resume' ? 'user_resume' : 'user_stop';
  return { commandId, issuedAt: candleOpenTime, kind, reason };
}
