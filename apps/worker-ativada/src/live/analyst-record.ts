// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystDecisionInput } from '@ativada/database';
import {
  ANALYST_VERSION,
  buildReasonMessage,
  FAILURE_MESSAGE,
  type AnalystDecision,
} from '@ativada/risk-analyst';

import { ANALYST_RECORD_MODE, ANALYST_RECORD_STATUS } from './analyst-live.constant.js';

// A linha da sombra (A19): a decisão inteira e, em `commands`, o que o analista DARIA contra a carteira real (`wouldCommands`).
export function toDecidedRecord(params: {
  readonly runId: string;
  readonly decision: AnalystDecision;
}): AnalystDecisionInput {
  const { runId, decision } = params;
  return {
    runId,
    candleTime: decision.candleTime,
    version: decision.version,
    mode: ANALYST_RECORD_MODE.SHADOW,
    status: ANALYST_RECORD_STATUS.DECIDED,
    posture: decision.posture,
    reason: decision.reason,
    cadenceMinutes: decision.cadenceMinutes,
    entryGate: decision.entryGate,
    riskScale: decision.riskScale,
    isTimeExitDue: decision.timeExitDue,
    forecast: decision.forecast,
    readings: decision.readings,
    specialists: decision.specialists,
    locks: decision.locks,
    commands: decision.commands,
    message: buildReasonMessage(decision),
    failureCode: undefined,
  };
}

// A falha da sombra grava SÓ o código estável: sem postura, sem blocos e sem o texto do erro (A18).
export function toFailedRecord(params: {
  readonly runId: string;
  readonly candleTime: number;
  readonly failureCode: string;
}): AnalystDecisionInput {
  return {
    runId: params.runId,
    candleTime: params.candleTime,
    version: ANALYST_VERSION,
    mode: ANALYST_RECORD_MODE.SHADOW,
    status: ANALYST_RECORD_STATUS.FAILED,
    posture: undefined,
    reason: undefined,
    cadenceMinutes: undefined,
    entryGate: undefined,
    riskScale: undefined,
    isTimeExitDue: undefined,
    forecast: undefined,
    readings: undefined,
    specialists: undefined,
    locks: undefined,
    commands: undefined,
    message: FAILURE_MESSAGE,
    failureCode: params.failureCode,
  };
}
