// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createExpireAuditEventsTask } from '../apps/cron-crypto/src/audit/expire-audit-events.task.js';
import { AUDIT_EVENT_RETENTION_MILLISECONDS } from '../apps/cron-crypto/src/cron.constant.js';
import type { AuditRetentionRepository } from '../packages/database/src/index.js';

const NOW = Date.parse('2026-10-09T12:00:00.000Z');
const DAY_MILLISECONDS = 86_400_000;

function createRepository(cutoffs: Date[]): AuditRetentionRepository {
  return {
    deleteEventsOlderThan: (cutoff): Promise<number> => {
      cutoffs.push(cutoff);
      return Promise.resolve(7);
    },
  };
}

describe('expire-audit-events', () => {
  test('the retention is the two years of the ADR (730 days)', () => {
    expect(AUDIT_EVENT_RETENTION_MILLISECONDS).toBe(730 * DAY_MILLISECONDS);
  });

  test('deletes events older than the retention and reports how many', async () => {
    const cutoffs: Date[] = [];
    const task = createExpireAuditEventsTask({
      repository: createRepository(cutoffs),
      now: () => NOW,
    });
    const summary = await task();
    expect(cutoffs.map((cutoff) => cutoff.getTime())).toStrictEqual([NOW - 730 * DAY_MILLISECONDS]);
    expect(summary).toStrictEqual({ deleted: 7, failures: 0 });
  });
});
