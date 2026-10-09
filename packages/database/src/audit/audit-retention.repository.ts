// Copyright (c) 2026 Ada Technology. All rights reserved.
import { lt } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { auditEvents } from '../schema/audit-events.schema.js';

export type AuditRetentionRepository = {
  readonly deleteEventsOlderThan: (cutoff: Date) => Promise<number>;
};

export function createAuditRetentionRepository(handle: DatabaseHandle): AuditRetentionRepository {
  const { database } = readOpenDatabase(handle);
  return {
    deleteEventsOlderThan: async (cutoff): Promise<number> => {
      const rows = await database
        .delete(auditEvents)
        .where(lt(auditEvents.createdAt, cutoff))
        .returning({ id: auditEvents.id });
      return rows.length;
    },
  };
}
