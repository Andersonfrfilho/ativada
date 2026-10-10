// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, JsonValue } from '../json-value.types.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
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

export type FailOrphanedRunsParams = {
  readonly kinds: readonly RunKind[];
  readonly errorCode: string;
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
  // Única operação sem dono: o boot marca as execuções órfãs de todos e devolve só a contagem.
  readonly failOrphanedRuns: (params: FailOrphanedRunsParams) => Promise<number>;
};
