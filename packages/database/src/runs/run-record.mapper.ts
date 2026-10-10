// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readJsonb } from '../jsonb.js';
import { runs } from '../schema/runs.schema.js';
import type { RunKind, RunStatus } from './run.constant.js';
import type { RunRecord } from './run.types.js';

// Sem `engine_state`: o estado do motor pode ser grande e tem leitura própria (`readCheckpoint`).
export const RUN_COLUMNS = {
  id: runs.id,
  strategyVersionId: runs.strategyVersionId,
  kind: runs.kind,
  status: runs.status,
  symbol: runs.symbol,
  timeframe: runs.timeframe,
  runParameters: runs.runParameters,
  runHash: runs.runHash,
  engineVersion: runs.engineVersion,
  signalEngineVersion: runs.signalEngineVersion,
  metricsVersion: runs.metricsVersion,
  periodStart: runs.periodStart,
  periodEnd: runs.periodEnd,
  lastCandleTime: runs.lastCandleTime,
  metrics: runs.metrics,
  progress: runs.progress,
  errorCode: runs.errorCode,
  migratedFromRunId: runs.migratedFromRunId,
  createdAt: runs.createdAt,
  startedAt: runs.startedAt,
  finishedAt: runs.finishedAt,
} as const;

export type RunRow = {
  readonly id: string;
  readonly strategyVersionId: string;
  readonly kind: string;
  readonly status: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly runParameters: unknown;
  readonly runHash: string;
  readonly engineVersion: string;
  readonly signalEngineVersion: string;
  readonly metricsVersion: string;
  readonly periodStart: number;
  readonly periodEnd: number | null;
  readonly lastCandleTime: number | null;
  readonly metrics: unknown;
  readonly progress: number;
  readonly errorCode: string | null;
  readonly migratedFromRunId: string | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
};

export function toRunRecord(row: RunRow): RunRecord {
  return {
    ...row,
    kind: row.kind as RunKind,
    status: row.status as RunStatus,
    runParameters: readJsonb(row.runParameters),
    periodEnd: row.periodEnd ?? undefined,
    lastCandleTime: row.lastCandleTime ?? undefined,
    metrics: row.metrics === null ? undefined : readJsonb(row.metrics),
    errorCode: row.errorCode ?? undefined,
    migratedFromRunId: row.migratedFromRunId ?? undefined,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  };
}
