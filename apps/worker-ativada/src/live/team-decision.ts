// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_TEAM_REPORT_STATUS, type TeamReportView } from '@ativada/database';
import {
  NO_READING_CODE,
  teamReportSchema,
  type ModelTeamKey,
  type TeamDecisionRecord,
} from '@ativada/model-agents';
import type { EngineCandle } from '@ativada/strategy-engine';

import { TEAM_NO_READING } from './team-step.constant.js';
import type { TeamInputPort, TeamStepSettings } from './live-run.types.js';

export type TeamRunKit = {
  readonly team: ModelTeamKey;
  readonly symbol: string;
  readonly candleMilliseconds: number;
  readonly input: TeamInputPort;
  readonly settings: TeamStepSettings;
};

// `reportId`/`failureCode`: o que vai para `team_run_inputs`; `isStored`: a vela já tinha a entrada gravada (replay).
export type ReadyTeamDecision = {
  readonly kind: 'ready';
  readonly record: TeamDecisionRecord;
  readonly reportId: string | null;
  readonly failureCode: string | null;
  readonly isStored: boolean;
};
export type TeamDecision = ReadyTeamDecision | { readonly kind: 'awaiting' };

function readProperty(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return Object.getOwnPropertyDescriptor(value, name)?.value;
}

// O relatório volta do banco como colunas + `roles` (entrada não confiável): o esquema da casa confere antes de qualquer uso.
function toDecidedRecord(view: TeamReportView): TeamDecisionRecord | undefined {
  const { decision } = view;
  if (decision === undefined) return undefined;
  const parsed = teamReportSchema.safeParse({
    trend: readProperty(decision.roles, 'trend'),
    risk: readProperty(decision.roles, 'risk'),
    decision: {
      action: decision.action,
      entryPrice: decision.entryPrice,
      targetPrice: decision.targetPrice,
      stopPrice: decision.stopPrice,
      confidence: decision.confidence,
      reason: readProperty(readProperty(decision.roles, 'decision'), 'reason'),
    },
  });
  return parsed.success
    ? { status: 'decided', opinionId: view.id, report: parsed.data }
    : undefined;
}

function noReading(
  code: string,
  extra: { readonly reportId?: string | null; readonly isStored?: boolean } = {},
): ReadyTeamDecision {
  return {
    kind: 'ready',
    record: { status: 'failed', failureCode: code },
    reportId: extra.reportId ?? null,
    failureCode: code,
    isStored: extra.isStored ?? false,
  };
}

function decided(view: TeamReportView, isStored: boolean): ReadyTeamDecision {
  const record = toDecidedRecord(view);
  if (record === undefined) {
    return noReading(TEAM_NO_READING.UNREADABLE, { reportId: view.id, isStored });
  }
  return { kind: 'ready', record, reportId: view.id, failureCode: null, isStored };
}

// REPLAY: a entrada gravada manda; o relógio e o provedor nunca entram.
async function replayStored(
  kit: TeamRunKit,
  stored: { readonly reportId: string | null; readonly failureCode: string | null },
): Promise<ReadyTeamDecision> {
  if (stored.failureCode !== null) {
    return noReading(stored.failureCode, { reportId: stored.reportId, isStored: true });
  }
  const view =
    stored.reportId === null ? undefined : await kit.input.readReportById(stored.reportId);
  if (view === undefined) return noReading(TEAM_NO_READING.UNREADABLE, { isStored: true });
  return decided(view, true);
}

// A vela só tem relatório agendado se o FECHAMENTO dela cai na grade do ritmo; fora dela não há o que esperar.
function isOnCadence(kit: TeamRunKit, candle: EngineCandle): boolean {
  const closeTime = candle.openTime + kit.candleMilliseconds;
  return closeTime % (kit.settings.cadenceMinutes * 60_000) === 0;
}

function classify(
  kit: TeamRunKit,
  params: {
    readonly candle: EngineCandle;
    readonly report: TeamReportView | undefined;
    readonly isPastDeadline: boolean;
  },
): TeamDecision {
  const { report, isPastDeadline } = params;
  if (report === undefined) {
    if (!isOnCadence(kit, params.candle)) return noReading(TEAM_NO_READING.NOT_SCHEDULED);
    return isPastDeadline ? noReading(NO_READING_CODE.MISSING) : { kind: 'awaiting' };
  }
  if (report.status === MODEL_TEAM_REPORT_STATUS.PENDING) {
    if (!isPastDeadline) return { kind: 'awaiting' };
    return noReading(NO_READING_CODE.PENDING, { reportId: report.id });
  }
  if (report.status !== MODEL_TEAM_REPORT_STATUS.DECIDED) {
    return noReading(report.failureCode ?? TEAM_NO_READING.UNKNOWN, { reportId: report.id });
  }
  // Decisão que chegou depois do prazo NUNCA é aplicada àquela vela.
  if (!report.isDecidedInTime) return noReading(TEAM_NO_READING.LATE, { reportId: report.id });
  return decided(report, false);
}

// A decisão da vela `t`: a entrada gravada (replay) ou o relatório agendado, esperando até o prazo pelo relógio do BANCO. O
// passo nunca dorme: sem decisão e dentro do prazo, devolve `awaiting` e a ronda seguinte tenta de novo.
export async function resolveTeamDecision(
  kit: TeamRunKit,
  candle: EngineCandle,
): Promise<TeamDecision> {
  const stored = await kit.input.readStoredInput(candle.openTime);
  if (stored !== undefined) return replayStored(kit, stored);
  const lookup = await kit.input.lookupScheduledReport({
    teamKey: kit.team,
    symbol: kit.symbol,
    candleTime: candle.openTime,
    deadlineAt: candle.openTime + kit.candleMilliseconds + kit.settings.deadlineMilliseconds,
  });
  return classify(kit, { candle, report: lookup.report, isPastDeadline: lookup.isPastDeadline });
}
