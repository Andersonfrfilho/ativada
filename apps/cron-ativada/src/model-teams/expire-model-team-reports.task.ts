// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TeamReportRepository } from '@ativada/database';

export type ExpireModelTeamReportsDependencies = {
  readonly repository: Pick<TeamReportRepository, 'expireReports'>;
  readonly retentionDays: number;
};

export type ExpireModelTeamReportsSummary = {
  readonly deleted: number;
  readonly failures: number;
};

export type ExpireModelTeamReportsTask = () => Promise<ExpireModelTeamReportsSummary>;

// DT10: relatório com mais de um ano sai, MENOS o que uma execução de equipe guardada ainda referencia (a reprodução depende dele).
export function createExpireModelTeamReportsTask(
  dependencies: ExpireModelTeamReportsDependencies,
): ExpireModelTeamReportsTask {
  return async () => {
    const deleted = await dependencies.repository.expireReports({
      olderThanDays: dependencies.retentionDays,
    });
    return { deleted, failures: 0 };
  };
}
