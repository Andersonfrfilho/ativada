// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TeamReportRepository } from '@ativada/database';
import { readErrorName } from '@ativada/environment';

import { MODEL_TEAM_LEASE_MARGIN_MILLISECONDS, MODEL_TEAM_LOG } from './model-teams.constant.js';
import { processReport, type ReportProcessorDependencies } from './report-processor.js';

export type ReportDispatchSummary = {
  readonly claimed: number;
  readonly errored: number;
};

export type ReportDispatcher = { readonly tick: () => Promise<ReportDispatchSummary> };

export type ReportDispatcherDependencies = {
  readonly processor: ReportProcessorDependencies;
  readonly claims: Pick<TeamReportRepository, 'claimPending'>;
  readonly concurrency: number;
};

// No máximo `concurrency` chamadas em voo (RNF05). Cada linha roda isolada (`allSettled`): erro de uma não derruba as outras nem o
// ciclo, e a linha que errou volta pelo arrendamento vencido (no máximo 2 tentativas, depois `ATTEMPTS_EXHAUSTED`).
export function createReportDispatcher(
  dependencies: ReportDispatcherDependencies,
): ReportDispatcher {
  const { processor } = dependencies;
  const leaseMilliseconds =
    processor.settings.timeoutMilliseconds + MODEL_TEAM_LEASE_MARGIN_MILLISECONDS;
  return {
    tick: async (): Promise<ReportDispatchSummary> => {
      const claimed = await dependencies.claims.claimPending({
        now: new Date(processor.now()),
        limit: dependencies.concurrency,
        leaseMilliseconds,
      });
      const outcomes = await Promise.allSettled(
        claimed.map((report) => processReport(processor, report)),
      );
      let errored = 0;
      outcomes.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') return;
        errored += 1;
        processor.logger.error(MODEL_TEAM_LOG.REPORT_ERRORED, {
          reportId: claimed[index]?.id ?? '',
          errorName: readErrorName(outcome.reason),
        });
      });
      return { claimed: claimed.length, errored };
    },
  };
}
