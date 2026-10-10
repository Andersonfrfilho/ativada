// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CommandInput,
  EquityPointInput,
  FillInput,
  OrderInput,
  PositionInput,
  RunStatus,
  SignalInput,
} from '../../../packages/database/src/index.js';
import type {
  EngineCandle,
  StoredSentimentObservation,
  StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';

export type StoredResults = {
  signals: Map<number, SignalInput>;
  orders: Map<string, OrderInput>;
  fills: Map<string, FillInput>;
  positions: Map<string, PositionInput>;
  equityPoints: Map<number, EquityPointInput>;
  commands: Map<string, CommandInput>;
};

export type StoredCheckpoint = {
  engineState: unknown;
  lastCandleTime: number;
  progress: number;
};

// Falha injetada: a operação do lote que lança, no `batch`-ésimo lote (1 = o primeiro).
export type InjectedFailure = {
  readonly operation: 'appendResults' | 'saveCheckpoint' | 'completeRun';
  readonly batch: number;
  // A falha é uma só: depois de disparada, a retomada segue sem ela.
  isSpent?: boolean;
};

export type InMemoryHooks = {
  // Chamado depois de cada COMMIT (lote 1 = o primeiro): o cancelamento do usuário chega aqui.
  afterCommit?: (batch: number, controls: InMemoryControls) => void;
  failure?: InjectedFailure;
  // Simula o processo que morreu: a falha não consegue gravar `failed`, e a execução fica `running`.
  isFailureUnrecordable?: boolean;
};

export type InMemoryControls = {
  readonly cancel: () => void;
};

export type InMemoryScenario = {
  readonly candles: readonly EngineCandle[];
  readonly sentiment?: readonly StoredSentimentObservation[];
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly hooks?: InMemoryHooks;
  // Adulteração do que o banco guarda (hash que não confere com o conteúdo).
  readonly tamper?: 'run_hash' | 'config_hash';
  readonly runKind?: string;
  // Outra estratégia que não o Placar clássico (por exemplo, com regra de sentimento).
  readonly strategy?: StrategyVersion;
  readonly initialStatus?: RunStatus;
};

export type OperationLog = string[];
