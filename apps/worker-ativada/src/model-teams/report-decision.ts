// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_TEAM_REPORT_STATUS, type FinishTeamReportParams } from '@ativada/database';
import {
  checkTeamLevels,
  computeCallCost,
  LEVELS_VERDICT,
  MODEL_CALL_STATUS,
  sanitizeReport,
  type ModelCallResult,
} from '@ativada/model-agents';

import { MODEL_TEAM_FAILURE, MODEL_TEAM_LOG } from './model-teams.constant.js';
import { failReport } from './report-outcome.js';
import type { OkResult, ReportContext } from './report-processor.types.js';

function toFinish(context: ReportContext, result: OkResult): FinishTeamReportParams {
  const sanitized = sanitizeReport(result.report);
  const { trend, risk, decision } = sanitized.report;
  return {
    reportId: context.report.id,
    status: MODEL_TEAM_REPORT_STATUS.DECIDED,
    costUsd: computeCallCost({ usage: result.usage, price: context.runtime.price }),
    measure: { ...result.usage, latencyMilliseconds: result.latencyMilliseconds },
    decision: {
      action: decision.action,
      entryPrice: decision.entryPrice,
      targetPrice: decision.targetPrice,
      stopPrice: decision.stopPrice,
      confidence: decision.confidence,
      roles: {
        trend: { stance: trend.stance, reason: trend.reason },
        risk: { level: risk.level, reason: risk.reason },
        decision: { reason: decision.reason },
      },
      isReasonHidden: sanitized.hiddenRoles.length > 0,
    },
    // A saída do modelo como chegou (já validada pelo Zod); o repositório corta em 2 KB.
    rawOutput: JSON.stringify(result.report),
  };
}

function withUsage(result: OkResult): ModelCallResult {
  return {
    status: MODEL_CALL_STATUS.INVALID_OUTPUT,
    measure: { ...result.usage, latencyMilliseconds: result.latencyMilliseconds },
  };
}

// RF07/RF08: coerência dos preços contra o fechamento de `t`, depois a higiene dos três textos; só então a linha vira `decided`.
export async function recordDecided(
  context: ReportContext,
  params: { readonly result: OkResult; readonly lastClose: string },
): Promise<void> {
  const verdict = checkTeamLevels({
    decision: params.result.report.decision,
    lastClose: params.lastClose,
    entryTolerancePercent: context.settings.entryTolerancePercent,
    minStopPercent: context.settings.minStopPercent,
  });
  if (verdict !== LEVELS_VERDICT.VALID) {
    return failReport(context, {
      code: MODEL_TEAM_FAILURE.INVALID_LEVELS,
      result: withUsage(params.result),
    });
  }
  await context.reports.finish(toFinish(context, params.result));
  context.logger.info(MODEL_TEAM_LOG.REPORT_DECIDED, {
    reportId: context.report.id,
    team: context.report.teamKey,
    action: params.result.report.decision.action,
  });
}
