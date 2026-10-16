// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readJsonb } from '../jsonb.js';
import { analystDecisions } from '../schema/analyst-decisions.schema.js';
import type { AnalystDecisionRecord } from './analyst-decision.types.js';

export const ANALYST_DECISION_COLUMNS = {
  runId: analystDecisions.runId,
  candleTime: analystDecisions.candleTime,
  version: analystDecisions.version,
  mode: analystDecisions.mode,
  status: analystDecisions.status,
  posture: analystDecisions.posture,
  reason: analystDecisions.reason,
  cadenceMinutes: analystDecisions.cadenceMinutes,
  entryGate: analystDecisions.entryGate,
  riskScale: analystDecisions.riskScale,
  isTimeExitDue: analystDecisions.isTimeExitDue,
  forecast: analystDecisions.forecast,
  readings: analystDecisions.readings,
  specialists: analystDecisions.specialists,
  locks: analystDecisions.locks,
  commands: analystDecisions.commands,
  message: analystDecisions.message,
  failureCode: analystDecisions.failureCode,
  createdAt: analystDecisions.createdAt,
} as const;

type JsonBlockKey = 'forecast' | 'readings' | 'specialists' | 'locks' | 'commands';

type AnalystDecisionRow = {
  readonly [Key in keyof AnalystDecisionRecord]: Key extends JsonBlockKey
    ? unknown
    : AnalystDecisionRecord[Key];
};

export function toAnalystDecisionRecord(row: AnalystDecisionRow): AnalystDecisionRecord {
  return {
    ...row,
    forecast: readJsonb(row.forecast),
    readings: readJsonb(row.readings),
    specialists: readJsonb(row.specialists),
    locks: readJsonb(row.locks),
    commands: readJsonb(row.commands),
  };
}
