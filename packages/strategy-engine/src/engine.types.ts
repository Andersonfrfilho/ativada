// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle, SentimentObservation } from './engine-candle.types.js';
import type {
  ClosedPositionDecision,
  FillDecision,
  OpenedPositionDecision,
  OrderEvent,
  StepDecisions,
} from './engine-decision.types.js';
import type { EngineState } from './engine-state.types.js';
import type { CommandKind, CommandReason } from './engine-vocabulary.constant.js';
import type { StrategyConfig, StrategyVersion } from './strategy-config.types.js';

// Ordem externa ao placar (meta atingida, parada pelo usuário, kill switch); age no fechamento do candle.
export type EngineCommand = {
  readonly kind: CommandKind;
  readonly reason: CommandReason;
};

export type StepInput = {
  readonly strategy: StrategyVersion;
  readonly state: EngineState;
  readonly candle: EngineCandle;
  readonly sentiment?: SentimentObservation;
  readonly commands?: readonly EngineCommand[];
};

export type StepResult = {
  readonly state: EngineState;
  readonly decisions: StepDecisions;
};

// O mesmo `step` serve ao backtest (laço sobre o banco), ao ao vivo (um candle por vez) e, na spec 002,
// à execução real: puro, sem I/O, sem relógio, sem aleatoriedade.
export type Engine = {
  readonly engineVersion: string;
  readonly createInitialState: (strategy: StrategyVersion) => EngineState;
  readonly step: (input: StepInput) => StepResult;
};

export type CreateEngine = () => Engine;

export type FillModelInput = {
  readonly state: EngineState;
  readonly candle: EngineCandle;
  readonly config: StrategyConfig;
};

export type FillModelResult = {
  readonly state: EngineState;
  readonly orders: readonly OrderEvent[];
  readonly fills: readonly FillDecision[];
  readonly openedPositions: readonly OpenedPositionDecision[];
  readonly closedPositions: readonly ClosedPositionDecision[];
};

// A costura com a corretora: o simulado preenche pelo OHLC (D6); o real (spec 002) aplica os
// preenchimentos reportados pela corretora, recebidos como dado. A decisão nunca muda de lugar.
export type FillModel = (input: FillModelInput) => FillModelResult;
