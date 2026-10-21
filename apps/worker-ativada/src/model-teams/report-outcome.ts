// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_TEAM_REPORT_STATUS } from '@ativada/database';
import {
  computeCallCost,
  MODEL_CALL_STATUS,
  type ModelCallResult,
  type ModelTokenUsage,
} from '@ativada/model-agents';

import { MODEL_TEAM_FAILURE, MODEL_TEAM_LOG } from './model-teams.constant.js';
import type { ReportBase, ReportContext } from './report-processor.types.js';

const ZERO_COST = '0';

const FAILURE_BY_STATUS: Readonly<Record<string, string>> = {
  [MODEL_CALL_STATUS.INVALID_OUTPUT]: MODEL_TEAM_FAILURE.INVALID_OUTPUT,
  [MODEL_CALL_STATUS.REFUSED]: MODEL_TEAM_FAILURE.REFUSED,
  [MODEL_CALL_STATUS.TIMEOUT]: MODEL_TEAM_FAILURE.TIMEOUT,
  [MODEL_CALL_STATUS.RATE_LIMITED]: MODEL_TEAM_FAILURE.RATE_LIMITED,
  [MODEL_CALL_STATUS.UNAVAILABLE]: MODEL_TEAM_FAILURE.UNAVAILABLE,
  [MODEL_CALL_STATUS.KEY_REJECTED]: MODEL_TEAM_FAILURE.KEY_REJECTED,
  [MODEL_CALL_STATUS.MODEL_NOT_FOUND]: MODEL_TEAM_FAILURE.MODEL_NOT_FOUND,
  [MODEL_CALL_STATUS.BAD_REQUEST]: MODEL_TEAM_FAILURE.BAD_REQUEST,
};

export function failureCodeOf(status: string): string {
  return FAILURE_BY_STATUS[status] ?? MODEL_TEAM_FAILURE.DISPATCH_ERROR;
}

// Pulo antes da chamada: custo zero, só o código (nunca texto de erro).
export async function skipReport(context: ReportBase, code: string): Promise<void> {
  await context.reports.finish({
    reportId: context.report.id,
    status: MODEL_TEAM_REPORT_STATUS.SKIPPED,
    costUsd: ZERO_COST,
    measure: {},
    failureCode: code,
  });
  context.logger.info(MODEL_TEAM_LOG.REPORT_SKIPPED, { reportId: context.report.id, code });
}

export type FailReportParams = {
  readonly code: string;
  readonly result?: ModelCallResult | undefined;
};

// A chamada que falhou custa o que o provedor devolveu em tokens; sem tokens, zero.
export async function failReport(context: ReportContext, params: FailReportParams): Promise<void> {
  const measure =
    params.result !== undefined && 'measure' in params.result ? params.result.measure : undefined;
  const usage: ModelTokenUsage = {
    inputTokens: measure?.inputTokens ?? 0,
    outputTokens: measure?.outputTokens ?? 0,
    thinkingTokens: measure?.thinkingTokens ?? 0,
  };
  await context.reports.finish({
    reportId: context.report.id,
    status: MODEL_TEAM_REPORT_STATUS.FAILED,
    costUsd:
      measure?.inputTokens === undefined
        ? ZERO_COST
        : computeCallCost({ usage, price: context.runtime.price }),
    measure: { ...measure },
    failureCode: params.code,
  });
  context.logger.warn(MODEL_TEAM_LOG.REPORT_FAILED, {
    reportId: context.report.id,
    team: context.report.teamKey,
    code: params.code,
  });
}
