// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle, SentimentObservation } from './engine-candle.types.js';
import type {
  ClosedPositionDecision,
  FillDecision,
  OpenedPositionDecision,
  OrderEvent,
  SignalDecision,
  StepDecisions,
  WalletDecisions,
} from './engine-decision.types.js';
import type { EngineState, SignalState, WalletState } from './engine-state.types.js';
import type {
  CommandKind,
  CommandReason,
  EntryRiskScale,
  EXECUTION_REPORT_KIND,
} from './engine-vocabulary.constant.js';
import type { EngineMarket, RunSetup, StrategyVersion } from './strategy-config.types.js';

// Ordem externa ao placar (meta, usuário, fim de janela); age no fechamento do candle e executa em t+1.
// `commandId` dá idempotência e trilha; `issuedAt` nunca é depois do fechamento do candle.
export type EngineCommand = {
  readonly commandId: string;
  readonly issuedAt: number;
  readonly kind: CommandKind;
  readonly reason: CommandReason;
};

// Fatos da corretora (spec 002), persistidos e entregues como entrada do passo. Só o tipo existe:
// a semântica é da spec 002 e a referência recusa relatórios em voz alta.
export type ExecutionReport =
  | {
      readonly kind: typeof EXECUTION_REPORT_KIND.FILL;
      readonly reportId: string;
      readonly reportedAt: number;
      readonly orderKey: string;
      readonly price: string;
      readonly quantity: string;
      readonly fee: string;
    }
  | {
      readonly kind: typeof EXECUTION_REPORT_KIND.ORDER_REJECTED;
      readonly reportId: string;
      readonly reportedAt: number;
      readonly orderKey: string;
    }
  | {
      readonly kind: typeof EXECUTION_REPORT_KIND.POSITION_CLOSED_EXTERNALLY;
      readonly reportId: string;
      readonly reportedAt: number;
      readonly positionKey: string;
      readonly price: string;
      readonly quantity: string;
      readonly fee: string;
    };

// `confirmedGapCandles`: quantos candles a Binance confirmadamente não tem antes deste (lacuna para a
// frente); sem a declaração exata, lacuna é recusada — paridade backtest × ao vivo.
export type StepInput = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly state: EngineState;
  readonly candle: EngineCandle;
  readonly sentiment?: SentimentObservation | undefined;
  readonly commands?: readonly EngineCommand[] | undefined;
  readonly executionReports?: readonly ExecutionReport[] | undefined;
  readonly confirmedGapCandles?: number | undefined;
  // Teto da entrada nova deste passo (A21): ausente = '1', '0' = nenhuma entrada; fora do configHash/runHash.
  readonly entryRiskScale?: EntryRiskScale | undefined;
};

export type StepResult = {
  readonly state: EngineState;
  readonly decisions: StepDecisions;
};

export type SignalStepInput = {
  readonly strategy: StrategyVersion;
  readonly market: EngineMarket;
  readonly state: SignalState;
  readonly candle: EngineCandle;
  readonly sentiment?: SentimentObservation | undefined;
  readonly confirmedGapCandles?: number | undefined;
};

export type SignalStepResult = {
  readonly state: SignalState;
  readonly signal: SignalDecision | null;
};

export type WalletStepInput = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly state: WalletState;
  readonly candle: EngineCandle;
  readonly signal: SignalDecision | null;
  readonly commands?: readonly EngineCommand[] | undefined;
  readonly executionReports?: readonly ExecutionReport[] | undefined;
  readonly entryRiskScale?: EntryRiskScale | undefined;
};

export type WalletStepResult = {
  readonly state: WalletState;
  readonly decisions: WalletDecisions;
};

export type CreateInitialStateParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
};

// O mesmo `step` serve ao backtest, ao ao vivo e à execução real: puro, sem I/O, sem relógio, sem
// aleatoriedade. `step` ≡ `walletStep ∘ signalStep` (o harness prova); as metades existem para o
// walk-forward e as metas calcularem o sinal uma vez e várias carteiras sobre ele.
export type Engine = {
  readonly engineVersion: string;
  readonly createInitialState: (params: CreateInitialStateParams) => EngineState;
  readonly step: (input: StepInput) => StepResult;
  readonly signalStep: (input: SignalStepInput) => SignalStepResult;
  readonly walletStep: (input: WalletStepInput) => WalletStepResult;
};

export type CreateEngine = () => Engine;

export type FillModelInput = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly state: WalletState;
  readonly candle: EngineCandle;
  readonly executionReports: readonly ExecutionReport[];
};

export type FillModelResult = {
  readonly state: WalletState;
  readonly orders: readonly OrderEvent[];
  readonly fills: readonly FillDecision[];
  readonly openedPositions: readonly OpenedPositionDecision[];
  readonly closedPositions: readonly ClosedPositionDecision[];
};

// A costura com a corretora: o simulado preenche pelo OHLC (D6); o real (spec 002) aplica os
// relatórios da corretora, recebidos como dado. A decisão nunca muda de lugar.
export type FillModel = (input: FillModelInput) => FillModelResult;
