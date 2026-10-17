// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_TEAM_REPORT_KIND, type ClaimedTeamReport } from '@ativada/database';
import {
  BUDGET_DECISION,
  computeReservation,
  decideBudget,
  findPromptPrivacyViolations,
  hashPrompt,
  MODEL_CALL_STATUS,
  renderPrompt,
  type BudgetDecision,
  type BudgetUsage,
} from '@ativada/model-agents';

import {
  MODEL_TEAM_CANDLE_MILLISECONDS,
  MODEL_TEAM_FAILURE,
  MODEL_TEAM_STALE_CANDLES,
} from './model-teams.constant.js';
import { recordDecided } from './report-decision.js';
import { loadReportInput } from './report-input.js';
import { failReport, failureCodeOf, skipReport } from './report-outcome.js';
import type { ReportContext, ReportProcessorDependencies } from './report-processor.types.js';

export type { ProcessorSettings, ReportProcessorDependencies } from './report-processor.types.js';

function isStale(context: ReportContext): boolean {
  if (context.report.kind !== MODEL_TEAM_REPORT_KIND.SCHEDULED) return false;
  const closedAt = context.report.candleTime + MODEL_TEAM_CANDLE_MILLISECONDS;
  return context.now() - closedAt > MODEL_TEAM_STALE_CANDLES * MODEL_TEAM_CANDLE_MILLISECONDS;
}

async function callProvider(
  context: ReportContext,
  params: { readonly prompt: string; readonly lastClose: string },
): Promise<void> {
  const { runtime, settings } = context;
  const result = await runtime.port.requestTeamReport({
    team: runtime.teamKey,
    prompt: params.prompt,
    limits: {
      timeoutMilliseconds: settings.timeoutMilliseconds,
      maxOutputTokens: settings.maxOutputTokens,
    },
    signal: context.signal,
  });
  const retryAfter =
    result.status === MODEL_CALL_STATUS.RATE_LIMITED
      ? { retryAfterMilliseconds: result.retryAfterMilliseconds }
      : {};
  context.circuits.record(runtime.teamKey, { status: result.status, ...retryAfter }, context.now());
  if (result.status === MODEL_CALL_STATUS.OK) {
    return recordDecided(context, { result, lastClose: params.lastClose });
  }
  return failReport(context, { code: failureCodeOf(result.status), result });
}

// Reserva o custo MÁXIMO da chamada sob a trava consultiva; `false` = o teto (dia ou mês) não deixa.
async function reserve(context: ReportContext, prompt: string): Promise<boolean> {
  const { settings, runtime } = context;
  const reservationUsd = computeReservation({
    promptLength: prompt.length,
    maxOutputTokens: settings.maxOutputTokens,
    maxThinkingTokens: runtime.maxThinkingTokens,
    price: runtime.price,
  });
  const decide = (usage: BudgetUsage): BudgetDecision =>
    decideBudget({ usage, reservationUsd, limits: settings.budget });
  const result = await context.reports.reserveBudget({
    reportId: context.report.id,
    reservationUsd,
    isAllowed: (usage) => decide(usage) === BUDGET_DECISION.ALLOW,
  });
  context.circuits.markBudget(runtime.teamKey, !result.isReserved);
  return result.isReserved;
}

// O caminho de UM relatório reivindicado (plan D2): STALE, chave, entrada pública, teto, circuito, chamada, gravação.
export async function processReport(
  dependencies: ReportProcessorDependencies,
  report: ClaimedTeamReport,
): Promise<void> {
  const runtime = dependencies.runtimes.get(report.teamKey);
  if (runtime === undefined) {
    return skipReport({ ...dependencies, report }, MODEL_TEAM_FAILURE.NO_KEY);
  }
  const context: ReportContext = { ...dependencies, report, runtime };
  if (isStale(context)) return skipReport(context, MODEL_TEAM_FAILURE.STALE);
  const loaded = await loadReportInput(context.sources, {
    symbol: report.symbol,
    candleTime: report.candleTime,
  });
  if (loaded === undefined) return skipReport(context, MODEL_TEAM_FAILURE.NO_INPUT);
  const prompt = renderPrompt(loaded.input);
  if (findPromptPrivacyViolations(prompt).length > 0) {
    return skipReport(context, MODEL_TEAM_FAILURE.PROMPT_REJECTED);
  }
  await context.reports.saveInput({
    reportId: report.id,
    input: loaded.input,
    promptHash: hashPrompt(prompt),
    modelId: runtime.modelId,
  });
  if (!(await reserve(context, prompt))) {
    return skipReport(context, MODEL_TEAM_FAILURE.BUDGET_EXHAUSTED);
  }
  // A permissão do circuito vem por último: o meio aberto libera UMA prova, e ela precisa mesmo chamar o provedor.
  if (!context.circuits.requestPermission(runtime.teamKey, context.now())) {
    return skipReport(context, MODEL_TEAM_FAILURE.CIRCUIT_OPEN);
  }
  return callProvider(context, { prompt, lastClose: loaded.lastClose });
}
