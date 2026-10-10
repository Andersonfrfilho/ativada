// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AlertInput,
  BatchCheckpointParams,
  EngineCheckpoint,
  LiveRunRepository,
  RunRecord,
  RunResultRows,
  StrategyVersionRecord,
} from '@cryptoada/database';
import type {
  Engine,
  EngineCandle,
  EngineTimeframe,
  StoredSentimentObservation,
} from '@cryptoada/strategy-engine';

import type { LIVE_COMMIT_OUTCOME, LIVE_PASS_KIND } from './live.constant.js';
import type { WorkerLogger } from '../logging/worker-logger.js';

export type LiveCandleWindow = {
  // `from` incluído, `to` excluído.
  readonly from: number;
  readonly to: number;
  readonly limit: number;
};

export type LiveSentimentQuery = { readonly source: string; readonly until: number };

export type LiveBlueprint = { readonly run: RunRecord; readonly version: StrategyVersionRecord };

// Um passo = UMA transação: as linhas que o candle gerou e o checkpoint (estado do motor + último candle).
export type LiveStepCommit = {
  readonly rows: RunResultRows;
  readonly checkpoint: BatchCheckpointParams;
  // Alertas de sinal do candle (RF10): entram na mesma transação, então reentrega do passo nunca os repete.
  readonly alerts: readonly AlertInput[];
};

// Taxa de acerto fora da amostra do último walk-forward concluído da versão (texto decimal exato) e as operações dela.
export type HistoricalHitRate = { readonly winRate: string; readonly trades: number };

// `maxAgeCandles`: candle com o fechamento mais velho que isto não gera alerta (replay, retomada depois de parada longa).
export type LiveAlertingSettings = {
  readonly now: () => number;
  readonly maxAgeCandles: number;
};

export type LiveCommitOutcome = (typeof LIVE_COMMIT_OUTCOME)[keyof typeof LIVE_COMMIT_OUTCOME];

// O que o avaliador pode fazer com UMA simulação, já presa ao dono dela.
export type LiveRunSession = {
  readonly findRun: () => Promise<LiveBlueprint | undefined>;
  readonly readCheckpoint: () => Promise<EngineCheckpoint | undefined>;
  readonly findCandles: (window: LiveCandleWindow) => Promise<readonly EngineCandle[]>;
  readonly listSentiment: (
    query: LiveSentimentQuery,
  ) => Promise<readonly StoredSentimentObservation[]>;
  readonly findHitRate: () => Promise<HistoricalHitRate | undefined>;
  readonly commitStep: (commit: LiveStepCommit) => Promise<LiveCommitOutcome>;
  readonly failRun: (errorCode: string) => Promise<boolean>;
};

export type LiveRunDatabase = {
  // `undefined`: a execução não existe ou a conta do dono está apagada ou bloqueada.
  readonly attach: (runId: string) => Promise<LiveRunSession | undefined>;
};

export type LiveRunClaims = Pick<
  LiveRunRepository,
  'claimLiveRuns' | 'renewHeartbeat' | 'releaseClaimedRuns' | 'cancelLiveRunsOfInactiveOwners'
>;

export type MissingCandles = {
  readonly symbol: string;
  readonly timeframe: EngineTimeframe;
  readonly openTimes: readonly number[];
};

// Só um buraco que a recuperação já tentou e a Binance não tem é lacuna CONFIRMADA (ADR 0002 §a); os demais esperam.
export type GapConfirmation = (missing: MissingCandles) => boolean;

export type LiveEvaluatorDependencies = {
  readonly claims: LiveRunClaims;
  readonly database: LiveRunDatabase;
  readonly instanceId: string;
  readonly heartbeatTimeoutSeconds: number;
  readonly isGapConfirmed: GapConfirmation;
  readonly logger: WorkerLogger;
  readonly engine?: Engine;
  readonly maxStepsPerPass?: number;
  // Ausente = alertas desligados (Telegram sem token): o passo não monta nem enfileira alerta algum.
  readonly alerting?: LiveAlertingSettings;
};

export type LivePassOutcome = {
  readonly kind: (typeof LIVE_PASS_KIND)[keyof typeof LIVE_PASS_KIND];
  readonly steps: number;
  // Primeira abertura do buraco que a execução espera ver preenchido (só em `waiting`).
  readonly waitingFromOpenTime?: number | undefined;
};

export type LiveTickSummary = {
  readonly claimed: number;
  readonly evaluated: number;
  readonly steps: number;
  readonly ended: number;
  readonly failed: number;
};

export type LiveEvaluator = {
  // Uma ronda inteira: cancela as de conta inativa, renova o batimento, reivindica e avalia o que for novo.
  readonly tick: () => Promise<LiveTickSummary>;
  // Devolve à fila as execuções desta instância (encerramento gracioso).
  readonly release: () => Promise<number>;
};
