// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CANDLE_MILLISECONDS, MILLISECONDS_PER_HOUR } from './live72.constant.js';
import { findShrunkCounts } from './run-counts.js';
import { computeSeriesStats } from './series-stats.js';
import { decideVerdict, type VerdictInput } from './verdict.js';
import type { ReportData, ReportInput, RestartEvidence } from './report-types.js';

const EVALUATION_LAG_MILLISECONDS = 2 * 60_000;
const RESUME_GRACE_CANDLES = 2;
const ELAPSED_DECIMAL_PLACES = 1;

function sumDuplicates(input: ReportInput): number {
  return Object.values(input.database.duplicates).reduce((total, count) => total + count, 0);
}

function buildRestart(input: ReportInput): RestartEvidence {
  const kill = input.events.controlledKill;
  const before = kill?.before ?? null;
  const after = input.database.counts;
  return {
    isFired: kill !== undefined,
    firedAt: kill?.at ?? null,
    before,
    after,
    evaluatedAfterKill: input.database.evaluatedAfterKill,
    shrunkFields: before === null ? [] : findShrunkCounts(before, after),
  };
}

function isResumeDue(restart: RestartEvidence, windowEnd: number): boolean {
  if (restart.firedAt === null) return false;
  return Date.parse(restart.firedAt) + RESUME_GRACE_CANDLES * CANDLE_MILLISECONDS <= windowEnd;
}

function endedEarly(input: ReportInput, plannedEnd: number): boolean {
  const { finishedAt } = input.database;
  return finishedAt !== null && Date.parse(finishedAt) < plannedEnd;
}

function toVerdictInput(params: {
  readonly input: ReportInput;
  readonly restart: RestartEvidence;
  readonly missingCandles: number;
  readonly window: { readonly end: number; readonly planned: number };
}): VerdictInput {
  const { input, restart } = params;
  return {
    isWindowComplete: params.window.end >= params.window.planned,
    runStatus: input.database.runStatus,
    runErrorCode: input.database.runErrorCode,
    endedEarly: endedEarly(input, params.window.planned),
    interventionCount: input.events.interventions.filter((item) => item.at >= input.run.startedAt)
      .length,
    duplicateTotal: sumDuplicates(input),
    missingCandles: params.missingCandles,
    isKillFired: restart.isFired,
    evaluatedAfterKill: restart.evaluatedAfterKill,
    isKillResumeDue: isResumeDue(restart, params.window.end),
    shrunkAfterKill: restart.shrunkFields,
    actionableSignals: input.database.windowActionableSignals,
    alertsGenerated: input.database.windowAlerts,
  };
}

export function buildReport(input: ReportInput): ReportData {
  const planned = Date.parse(input.run.plannedEndAt);
  const end = Math.min(input.now - EVALUATION_LAG_MILLISECONDS, planned);
  const stats = computeSeriesStats(input.database.series, {
    periodStart: input.run.periodStart,
    windowEnd: end,
    initialBalance: input.run.initialBalance,
  });
  const restart = buildRestart(input);
  const decision = decideVerdict(
    toVerdictInput({
      input,
      restart,
      missingCandles: stats.missingCandles,
      window: { end, planned },
    }),
  );
  const elapsed = (end - Date.parse(input.run.startedAt)) / MILLISECONDS_PER_HOUR;
  return {
    verdict: decision.verdict,
    reasons: decision.reasons,
    run: input.run,
    generatedAt: new Date(input.now).toISOString(),
    windowEndAt: new Date(end).toISOString(),
    elapsedHours: Math.max(0, elapsed).toFixed(ELAPSED_DECIMAL_PLACES),
    isWindowComplete: end >= planned,
    events: input.events,
    invalidEventLines: input.invalidEventLines,
    restart,
    stats,
    database: input.database,
    logErrors: input.logErrors,
  };
}
