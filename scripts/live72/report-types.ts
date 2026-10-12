// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EventSummary } from './live72-events.js';
import type { LogErrorTotals } from './log-errors.js';
import type { RunCounts } from './run-counts.js';
import type { RunFile } from './run-file.js';
import type { SeriesPoint, SeriesStats } from './series-stats.js';
import type { Verdict } from './live72.constant.js';

export type AlertSample = {
  readonly candleTime: number;
  readonly side: string;
  readonly status: string;
  readonly symbol: string;
  readonly closePrice: string;
  readonly score: string;
  readonly simulatedAction: string;
};

export type DuplicateCounts = {
  readonly signals: number;
  readonly orders: number;
  readonly fills: number;
  readonly equityPoints: number;
  readonly alerts: number;
};

export type DatabaseFacts = {
  readonly runStatus: string;
  readonly runErrorCode: string | null;
  readonly goalOutcome: string | null;
  readonly finishedAt: string | null;
  readonly isWaitingForData: boolean;
  readonly counts: RunCounts;
  readonly actionableSignals: number;
  readonly windowActionableSignals: number;
  readonly windowAlerts: number;
  readonly duplicates: DuplicateCounts;
  readonly series: readonly SeriesPoint[];
  readonly evaluatedAfterKill: number | null;
  readonly alertsByStatus: Readonly<Record<string, number>>;
  readonly alertSample: readonly AlertSample[];
};

export type ReportInput = {
  readonly run: RunFile;
  readonly now: number;
  readonly events: EventSummary;
  readonly invalidEventLines: number;
  readonly logErrors: LogErrorTotals;
  readonly database: DatabaseFacts;
};

export type RestartEvidence = {
  readonly isFired: boolean;
  readonly firedAt: string | null;
  readonly before: RunCounts | null;
  readonly after: RunCounts;
  readonly evaluatedAfterKill: number | null;
  readonly shrunkFields: readonly string[];
};

export type ReportData = {
  readonly verdict: Verdict;
  readonly reasons: readonly string[];
  readonly run: RunFile;
  readonly generatedAt: string;
  readonly windowEndAt: string;
  readonly elapsedHours: string;
  readonly isWindowComplete: boolean;
  readonly events: EventSummary;
  readonly invalidEventLines: number;
  readonly restart: RestartEvidence;
  readonly stats: SeriesStats;
  readonly database: DatabaseFacts;
  readonly logErrors: LogErrorTotals;
};
