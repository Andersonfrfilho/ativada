// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ClaimedTeamReport, TeamReportRepository } from '@ativada/database';
import type { BudgetLimits, ModelCallResult } from '@ativada/model-agents';

import type { WorkerLogger } from '../logging/worker-logger.js';
import type { TeamRuntime } from './build-team-runtimes.js';
import type { ReportInputSources } from './report-input.js';
import type { TeamCircuits } from './team-circuits.js';

export type ProcessorSettings = {
  readonly timeoutMilliseconds: number;
  readonly maxOutputTokens: number;
  readonly budget: BudgetLimits;
  readonly entryTolerancePercent: string;
  readonly minStopPercent: string;
};

export type ReportProcessorDependencies = {
  readonly reports: Pick<TeamReportRepository, 'saveInput' | 'reserveBudget' | 'finish'> &
    ReportInputSources['reports'];
  readonly sources: ReportInputSources;
  readonly runtimes: ReadonlyMap<string, TeamRuntime>;
  readonly circuits: TeamCircuits;
  readonly settings: ProcessorSettings;
  readonly logger: WorkerLogger;
  readonly now: () => number;
  readonly signal: AbortSignal;
};

export type ReportBase = ReportProcessorDependencies & { readonly report: ClaimedTeamReport };
export type ReportContext = ReportBase & { readonly runtime: TeamRuntime };
export type OkResult = Extract<ModelCallResult, { status: 'ok' }>;
