// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalRunOutcome, JsonValue, RunKind, RunRecord, RunStatus } from '@ativada/database';
import { readDuelGroupId, readSignalSource, type SignalSource } from '@ativada/model-agents';
import type { BalanceSurvival } from '@ativada/strategy-engine';
import { RUN_KIND, RUN_STATUS } from '@ativada/database';

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
  // A meta a que a simulação ao vivo está atrelada e como terminou (`null` enquanto não terminou ou sem meta).
  readonly goalId: string | null;
  readonly goalOutcome: GoalRunOutcome | null;
  // A equipe de modelo cuja decisão a simulação segue (spec 015); `null` na execução de regra.
  readonly signalSource: SignalSource | null;
  // O duelo de que a simulação faz parte (as execuções do grupo); `null` fora de duelo.
  readonly duelId: string | null;
  // Início (ms UTC) da parada da simulação ao vivo; ausente quando ela está em dia (e em qualquer execução que não esteja rodando).
  readonly stalledSince?: number;
};

export type RunQueuePositionView = { readonly own: number; readonly overall: number };

// A simulação ao vivo está parada à espera de candles que faltam: desde quando (ms) e a primeira abertura que falta.
export type WaitingForDataView = { readonly since: number; readonly openTime: number };

export type RunDetailView = RunView & {
  readonly warnings: readonly RunWarning[];
  // 1-based, só para `queued`: entre as execuções do dono e na fila inteira (só o número). `null` fora da fila.
  readonly queuePosition: RunQueuePositionView | null;
  // Piso e meta de dobro do saldo (RF09): só na simulação ao vivo.
  readonly survival: BalanceSurvival | null;
  readonly waitingForData: WaitingForDataView | null;
};

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

function toStalledSince(record: RunRecord): { readonly stalledSince?: number } {
  if (record.status !== RUN_STATUS.RUNNING || record.stalledSince === undefined) return {};
  return { stalledSince: record.stalledSince };
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
    goalId: record.goalId ?? null,
    goalOutcome: record.goalOutcome ?? null,
    signalSource: readSignalSource(record.request) ?? null,
    duelId: readDuelGroupId(record.request) ?? null,
    ...toStalledSince(record),
  };
}

// Só a execução que está rodando espera: a gravação que sobrou numa terminada não é mostrada.
export function toWaitingForData(record: RunRecord): WaitingForDataView | null {
  if (record.status !== RUN_STATUS.RUNNING) return null;
  if (record.waitingSince === undefined || record.waitingOpenTime === undefined) return null;
  return { since: record.waitingSince, openTime: record.waitingOpenTime };
}
