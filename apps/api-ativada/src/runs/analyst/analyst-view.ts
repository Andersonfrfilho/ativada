// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystDecisionRecord } from '@ativada/database';
import {
  ANALYST_DISCLAIMER,
  buildActiveLockMessages,
  buildCadenceLine,
  buildLockLines,
  buildOffCadenceMessage,
  buildPostureLine,
  buildSpecialistRow,
  buildTimeExitMessage,
  describeSpecialistMotive,
  FAILURE_MESSAGE,
  isOnCadence,
  lockMessage,
  MAX_TRADE_MINUTES,
  POSTURE_LABEL,
  STRATEGY_AUDIT_KEY,
  type AnalystDecision,
  type SpecialistView,
} from '@ativada/risk-analyst';

import { STORED_DECISION_SCHEMA, type StoredDecision } from './analyst-blocks.schema.js';
import { ANALYST_DECISION_STATUS, ANALYST_MODE } from './analyst.constant.js';
import type {
  AnalystDecisionView,
  AnalystLockView,
  DecidedAnalystView,
  SpecialistViewRow,
} from './analyst.schema.js';

export type AnalystViewParams = {
  readonly record: AnalystDecisionRecord;
  readonly riskPerTrade: string;
  readonly durationMilliseconds: number;
};

// A linha como a regra pura a produziu: o que a tabela não guarda (o detalhe do motivo) fica de fora e a frase do motivo
// vem pronta de `message`.
function parseStoredDecision(record: AnalystDecisionRecord): StoredDecision {
  return STORED_DECISION_SCHEMA.parse(record);
}

// O Zod devolve o campo opcional como `undefined` explícito; a regra pura o quer ausente.
function withoutUndefinedRuleVotes(
  specialist: StoredDecision['specialists'][number],
): SpecialistView {
  const { ruleVotes, ...rest } = specialist;
  return ruleVotes === undefined ? rest : { ...rest, ruleVotes };
}

function toDecision(stored: StoredDecision): AnalystDecision {
  return {
    version: stored.version,
    candleTime: stored.candleTime,
    posture: stored.posture,
    reason: stored.reason,
    reasonDetail: null,
    cadenceMinutes: stored.cadenceMinutes,
    isOnCadence: isOnCadence({
      candleTime: stored.candleTime,
      cadenceMinutes: stored.cadenceMinutes,
    }),
    entryGate: stored.entryGate,
    riskScale: stored.riskScale,
    maxTradeMinutes: MAX_TRADE_MINUTES,
    timeExitDue: stored.isTimeExitDue,
    forecast: stored.forecast,
    readings: stored.readings,
    specialists: stored.specialists.map(withoutUndefinedRuleVotes),
    locks: stored.locks,
    commands: stored.commands,
  };
}

function motiveOf(specialist: SpecialistView): string | null {
  if (specialist.key === STRATEGY_AUDIT_KEY) return null;
  return describeSpecialistMotive({
    key: specialist.key,
    vote: specialist.vote,
    isUnread: specialist.isUnread,
    ruleVotes: specialist.ruleVotes,
  });
}

function toSpecialistRows(decision: AnalystDecision): SpecialistViewRow[] {
  return decision.specialists.map((specialist) => {
    const row = buildSpecialistRow(specialist);
    const { ruleVotes, ...stored } = specialist;
    return {
      ...stored,
      ...(ruleVotes === undefined ? {} : { ruleVotes: [...ruleVotes] }),
      label: row.label,
      voteLabel: row.vote,
      accuracyText: row.accuracy,
      verdictLabel: row.situation,
      weightText: row.weight,
      motive: motiveOf(specialist),
    };
  });
}

// As cinco travas com a linha de cada uma e, nas ativas, a frase do motivo.
function toLockViews(decision: AnalystDecision): AnalystLockView[] {
  const lines = buildLockLines(decision);
  return decision.locks.map((lock, index) => ({
    ...lock,
    line: lines[index] ?? '',
    message: lock.isActive ? lockMessage(decision, lock.key) : null,
  }));
}

export function toDecidedAnalystView(params: AnalystViewParams): DecidedAnalystView {
  const { record } = params;
  const stored = parseStoredDecision(record);
  const decision = toDecision(stored);
  const isShadow = record.mode === ANALYST_MODE.SHADOW;
  return {
    status: ANALYST_DECISION_STATUS.DECIDED,
    candleTime: record.candleTime,
    closedAt: record.candleTime + params.durationMilliseconds,
    posture: decision.posture,
    postureLabel: POSTURE_LABEL[decision.posture],
    cadenceMinutes: decision.cadenceMinutes,
    isOnCadence: decision.isOnCadence,
    entryGate: decision.entryGate,
    riskScale: decision.riskScale,
    maxTradeMinutes: decision.maxTradeMinutes,
    timeExitDue: decision.timeExitDue,
    forecast: decision.forecast,
    specialists: toSpecialistRows(decision),
    readings: decision.readings,
    commands: [...decision.commands],
    isShadow,
    message: buildPostureLine(decision, params.riskPerTrade),
    reasonMessage: stored.message,
    cadenceLine: buildCadenceLine(decision),
    offCadenceMessage: buildOffCadenceMessage(decision),
    timeExitMessage: decision.timeExitDue
      ? buildTimeExitMessage({ maxTradeMinutes: decision.maxTradeMinutes, isShadow })
      : null,
    lockMessages: [...buildActiveLockMessages(decision)],
    locks: toLockViews(decision),
    disclaimer: ANALYST_DISCLAIMER,
  };
}

function toFailedView(params: AnalystViewParams): AnalystDecisionView {
  const { record } = params;
  return {
    status: ANALYST_DECISION_STATUS.FAILED,
    candleTime: record.candleTime,
    closedAt: record.candleTime + params.durationMilliseconds,
    isShadow: record.mode === ANALYST_MODE.SHADOW,
    message: record.message ?? FAILURE_MESSAGE,
    failureCode: record.failureCode,
    disclaimer: ANALYST_DISCLAIMER,
  };
}

// Uma decisão gravada em forma de resposta: frases do catálogo fechado (A17) e os números do auditor como o worker os
// gravou; nada é recalculado por pedido (spec 007, A20).
export function toAnalystDecisionView(params: AnalystViewParams): AnalystDecisionView {
  return params.record.status === ANALYST_DECISION_STATUS.FAILED
    ? toFailedView(params)
    : toDecidedAnalystView(params);
}
