// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, type AnalystDecisionRecord, type RunRecord } from '@ativada/database';
import { FAILURE_MESSAGE, UNAVAILABLE_MESSAGE } from '@ativada/risk-analyst';

import { toWaitingForData } from '../run-view.js';
import {
  ANALYST_DECISION_STATUS,
  ANALYST_UNAVAILABLE_REASON,
  type AnalystUnavailableReason,
} from './analyst.constant.js';
import type { AnalystView, DecidedAnalystView } from './analyst.schema.js';

// Por que não há decisão para mostrar agora, na precedência da A20; `undefined` = a última linha é uma decisão.
function findUnavailableReason(params: {
  readonly run: RunRecord;
  readonly latest: AnalystDecisionRecord | undefined;
}): AnalystUnavailableReason | undefined {
  const { run, latest } = params;
  if (run.status !== RUN_STATUS.RUNNING) return ANALYST_UNAVAILABLE_REASON.NOT_RUNNING;
  if (run.stalledSince !== undefined) return ANALYST_UNAVAILABLE_REASON.STALLED;
  if (toWaitingForData(run) !== null) return ANALYST_UNAVAILABLE_REASON.WAITING_FOR_DATA;
  if (latest === undefined) {
    return run.lastCandleTime === undefined
      ? ANALYST_UNAVAILABLE_REASON.NO_CANDLE
      : ANALYST_UNAVAILABLE_REASON.WARMING_UP;
  }
  return latest.status === ANALYST_DECISION_STATUS.FAILED
    ? ANALYST_UNAVAILABLE_REASON.FAILED
    : undefined;
}

// A frase fixa do catálogo (A17); a falha da última vela usa a frase de falha, sem o texto do erro.
function unavailableMessage(reason: AnalystUnavailableReason): string {
  return reason === ANALYST_UNAVAILABLE_REASON.FAILED
    ? FAILURE_MESSAGE
    : UNAVAILABLE_MESSAGE[reason];
}

// O `current` da rota: a decisão mais nova ou o motivo, com a frase, de ela não aparecer.
export function resolveCurrent(params: {
  readonly run: RunRecord;
  readonly latest: AnalystDecisionRecord | undefined;
  readonly decided: DecidedAnalystView | undefined;
}): AnalystView['current'] {
  const { run, latest, decided } = params;
  const reason = findUnavailableReason({ run, latest });
  if (reason === undefined && decided !== undefined) return decided;
  const why = reason ?? ANALYST_UNAVAILABLE_REASON.FAILED;
  return { status: 'unavailable', reason: why, message: unavailableMessage(why) };
}
