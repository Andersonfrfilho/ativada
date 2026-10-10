// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonValue, RunKind, RunRecord, RunStatus } from '@cryptoada/database';
import { RUN_KIND } from '@cryptoada/database';

export type RunWarning = { readonly code: string; readonly message: string };

// O que a API devolve de uma execução: sem dono, sem hash e sem o estado do motor.
export type RunView = {
  readonly id: string;
  readonly strategyVersionId: string;
  readonly kind: RunKind;
  readonly status: RunStatus;
  readonly symbol: string;
  readonly timeframe: string;
  readonly runParameters: JsonValue;
  readonly periodStart: number;
  readonly periodEnd: number | null;
  readonly progress: number;
  readonly lastCandleTime: number | null;
  readonly metrics: JsonValue | null;
  readonly overfitting: JsonValue | null;
  readonly errorCode: string | null;
  readonly engineVersion: string;
  readonly signalEngineVersion: string;
  readonly metricsVersion: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
};

export type RunDetailView = RunView & { readonly warnings: readonly RunWarning[] };

function isJsonObject(
  value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// O alerta de overfitting mora em `metrics.overfitting` do walk-forward concluído.
function readOverfitting(record: RunRecord): JsonValue | null {
  if (record.kind !== RUN_KIND.WALK_FORWARD || !isJsonObject(record.metrics)) return null;
  return record.metrics['overfitting'] ?? null;
}

export function toRunView(record: RunRecord): RunView {
  return {
    id: record.id,
    strategyVersionId: record.strategyVersionId,
    kind: record.kind,
    status: record.status,
    symbol: record.symbol,
    timeframe: record.timeframe,
    runParameters: record.runParameters,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd ?? null,
    progress: record.progress,
    lastCandleTime: record.lastCandleTime ?? null,
    metrics: record.metrics ?? null,
    overfitting: readOverfitting(record),
    errorCode: record.errorCode ?? null,
    engineVersion: record.engineVersion,
    signalEngineVersion: record.signalEngineVersion,
    metricsVersion: record.metricsVersion,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
  };
}
