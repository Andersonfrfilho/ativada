// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AuditRetentionRepository } from '@ativada/database';

import { AUDIT_EVENT_RETENTION_MILLISECONDS } from '../cron.constant.js';

export type ExpireAuditEventsDependencies = {
  readonly repository: AuditRetentionRepository;
  readonly now: () => number;
};

export type ExpireAuditEventsSummary = {
  readonly deleted: number;
  readonly failures: number;
};

export type ExpireAuditEventsTask = () => Promise<ExpireAuditEventsSummary>;

export function createExpireAuditEventsTask(
  dependencies: ExpireAuditEventsDependencies,
): ExpireAuditEventsTask {
  return async () => {
    const cutoff = new Date(dependencies.now() - AUDIT_EVENT_RETENTION_MILLISECONDS);
    const deleted = await dependencies.repository.deleteEventsOlderThan(cutoff);
    return { deleted, failures: 0 };
  };
}
