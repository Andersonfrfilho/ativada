// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, JsonValue } from '../json-value.types.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { GoalRunOutcome } from '../goals/goal.constant.js';
import type { RunKind, RunStatus } from './run.constant.js';

export type RunRecord = {
  readonly id: string;
  readonly strategyVersionId: string;
  readonly kind: RunKind;
  readonly status: RunStatus;
  readonly symbol: string;
  readonly timeframe: string;
  readonly runParameters: JsonValue;
  readonly runHash: string;
  readonly engineVersion: string;
  readonly signalEngineVersion: string;
  readonly metricsVersion: string;
  readonly periodStart: number;
  readonly periodEnd: number | undefined;
  readonly lastCandleTime: number | undefined;
  readonly metrics: JsonValue | undefined;
  readonly progress: number;
  readonly errorCode: string | undefined;
  readonly migratedFromRunId: string | undefined;
  // O pedido da execução (a grade e as janelas do walk-forward); nulo no backtest.
  readonly request: JsonValue | undefined;
  // A meta a que a simulação ao vivo está atrelada e como ela terminou (`goalOutcome` e o candle do desfecho: ambos ou nenhum).
  readonly goalId: string | undefined;
  readonly goalOutcome: GoalRunOutcome | undefined;
  readonly goalOutcomeCandleTime: number | undefined;
  readonly createdAt: Date;
  readonly startedAt: Date | undefined;
  readonly finishedAt: Date | undefined;
};

export type CreateRunParams = {
  readonly strategyVersionId: string;
  readonly kind: RunKind;
  readonly symbol: string;
  readonly timeframe: string;
  readonly runParameters: JsonContainer;
  readonly runHash: string;
  readonly engineVersion: string;
  readonly signalEngineVersion: string;
  readonly metricsVersion: string;
  readonly periodStart: number;
  readonly periodEnd: number | undefined;
  readonly migratedFromRunId: string | undefined;
  readonly request?: JsonContainer | undefined;
  // Só a simulação ao vivo: a meta do dono a que ela fica atrelada (a FK composta recusa meta de outro dono).
  readonly goalId?: string | undefined;
};

export type EngineCheckpoint = {
  readonly engineState: JsonValue | undefined;
  readonly lastCandleTime: number | undefined;
  readonly progress: number;
};

export type SaveCheckpointParams = {
  readonly runId: string;
  readonly engineState: JsonContainer;
  readonly lastCandleTime: number;
  readonly progress: number;
};

export type TransitionRunParams = {
  readonly runId: string;
  readonly to: RunStatus;
  readonly metrics?: JsonContainer;
  readonly errorCode?: string;
};

export type TransitionRunResult =
  | { readonly outcome: 'transitioned'; readonly run: RunRecord }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'invalid_transition'; readonly currentStatus: RunStatus };

// `createdAt` é o texto do Postgres com microssegundos: o Date do JS só guarda milissegundos.
export type RunCursor = {
  readonly createdAt: string;
  readonly id: string;
};

export type ListRunsParams = {
  readonly limit: number;
  readonly after: RunCursor | undefined;
  readonly kind: RunKind | undefined;
};

export type RunsPage = {
  readonly runs: readonly RunRecord[];
  readonly nextCursor: RunCursor | undefined;
};

export type RunRepository = {
  readonly createRun: (
    scope: OwnerScope,
    params: CreateRunParams,
  ) => Promise<RunRecord | undefined>;
  readonly findRun: (scope: OwnerScope, runId: string) => Promise<RunRecord | undefined>;
  readonly listRuns: (scope: OwnerScope, params: ListRunsParams) => Promise<RunsPage>;
  readonly transitionRun: (
    scope: OwnerScope,
    params: TransitionRunParams,
  ) => Promise<TransitionRunResult>;
  readonly saveCheckpoint: (scope: OwnerScope, params: SaveCheckpointParams) => Promise<boolean>;
  readonly readCheckpoint: (
    scope: OwnerScope,
    runId: string,
  ) => Promise<EngineCheckpoint | undefined>;
};
