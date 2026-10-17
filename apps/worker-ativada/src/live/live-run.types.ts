// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AlertInput,
  AnalystDecisionInput,
  AnalystHistory,
  DataWaitState,
  GoalRunOutcome,
  BatchCheckpointParams,
  EngineCheckpoint,
  LiveRunRepository,
  RunRecord,
  RunResultRows,
  ScheduledReportLookup,
  StoredTeamRunInput,
  StrategyVersionRecord,
  LookupScheduledReportParams,
  TeamReportView,
  TeamRunInputWrite,
} from '@ativada/database';
import type {
  Engine,
  EngineCandle,
  EngineTimeframe,
  StoredSentimentObservation,
} from '@ativada/strategy-engine';

import type { LIVE_COMMIT_OUTCOME, LIVE_PASS_KIND } from './live.constant.js';
import type { GapPolicy } from './gap-policy.js';
import type { WorkerLogger } from '../logging/worker-logger.js';

export type LiveCandleWindow = {
  // `from` incluído, `to` excluído.
  readonly from: number;
  readonly to: number;
  readonly limit: number;
};

export type LiveSentimentQuery = { readonly source: string; readonly until: number };

export type LiveBlueprint = { readonly run: RunRecord; readonly version: StrategyVersionRecord };

// A meta da simulação neste passo, na MESMA transação do candle: o desfecho decidido (uma vez) e se a execução termina.
export type LiveGoalCommit = {
  readonly outcome?: { readonly outcome: GoalRunOutcome; readonly candleTime: number } | undefined;
  // A saída por meta já se completou (sem posição nem ordem pendente): a execução vira concluída junto com o passo.
  readonly shouldComplete: boolean;
};

// Um passo = UMA transação: as linhas que o candle gerou e o checkpoint (estado do motor + último candle).
export type LiveStepCommit = {
  readonly rows: RunResultRows;
  readonly checkpoint: BatchCheckpointParams;
  // Alertas de sinal do candle (RF10): entram na mesma transação, então reentrega do passo nunca os repete.
  readonly alerts: readonly AlertInput[];
  readonly goal?: LiveGoalCommit;
  // O passo atravessa um buraco que a simulação esperava: a espera gravada some junto com o passo.
  readonly shouldClearWait?: boolean;
  // A decisão do analista de risco em sombra (spec 007): entra na mesma transação e some junto com ela se o passo for desfeito.
  readonly analyst?: AnalystDecisionInput;
  // A entrada gravada da vela numa execução de equipe (plan D9): some junto com o passo se ele for desfeito.
  readonly teamInput?: TeamRunInputWrite;
};

// Taxa de acerto fora da amostra do último walk-forward concluído da versão (texto decimal exato) e as operações dela.
export type HistoricalHitRate = { readonly winRate: string; readonly trades: number };

// `maxAgeCandles`: candle com o fechamento mais velho que isto não gera alerta (replay, retomada depois de parada longa).
export type LiveAlertingSettings = {
  readonly now: () => number;
  readonly maxAgeCandles: number;
};

export type LiveCommitOutcome = (typeof LIVE_COMMIT_OUTCOME)[keyof typeof LIVE_COMMIT_OUTCOME];

// O que a execução de equipe lê do banco para decidir a vela (plan D9); o relógio do prazo é o do BANCO.
export type TeamInputPort = {
  readonly readStoredInput: (candleTime: number) => Promise<StoredTeamRunInput | undefined>;
  readonly readReportById: (reportId: string) => Promise<TeamReportView | undefined>;
  readonly lookupScheduledReport: (
    params: LookupScheduledReportParams,
  ) => Promise<ScheduledReportLookup>;
};

// O prazo da decisão e o ritmo das equipes, do ambiente do worker.
export type TeamStepSettings = {
  readonly deadlineMilliseconds: number;
  readonly cadenceMinutes: number;
};

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
  // Registra (e conta) a espera por um buraco de candles NA execução; `undefined` se ela não está mais `running`.
  readonly recordDataWait: (params: RecordDataWaitInput) => Promise<DataWaitState | undefined>;
  readonly failRun: (errorCode: string) => Promise<boolean>;
  // O placar, o patrimônio e as posições da PRÓPRIA simulação, a partir de uma vela (só o analista lê).
  readonly readAnalystHistory: (params: {
    readonly fromCandleTime: number;
  }) => Promise<AnalystHistory>;
  // Só a execução de equipe lê; ausente em quem não tem equipes (testes em memória).
  readonly team?: TeamInputPort;
};

export type RecordDataWaitInput = {
  readonly openTime: number;
  readonly now: number;
  readonly lastCleanRecoveryAt: number;
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
  // Ausente = só a recuperação em memória decide a lacuna (testes); a produção sempre a liga.
  readonly gapPolicy?: GapPolicy;
  readonly logger: WorkerLogger;
  readonly engine?: Engine;
  readonly maxStepsPerPass?: number;
  // Ausente = alertas desligados (Telegram sem token): o passo não monta nem enfileira alerta algum.
  readonly alerting?: LiveAlertingSettings;
  // Ausente = execução de equipe recusada (o worker sem equipes); a produção sempre o liga.
  readonly team?: TeamStepSettings;
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
