// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import type { UserId } from '../ownership/user-id.js';
import { auditEvents } from '../schema/audit-events.schema.js';
import type { AuditActorKind } from './audit-event.constant.js';

export type AuditEventInput = {
  readonly actorUserId: UserId | undefined;
  readonly actorKind: AuditActorKind;
  readonly targetKind: string;
  readonly targetId: string | undefined;
  readonly action: string;
  readonly ip: string | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type AuditEventRepository = {
  readonly record: (event: AuditEventInput) => Promise<void>;
};

export function createAuditEventRepository(handle: DatabaseHandle): AuditEventRepository {
  const { database } = readOpenDatabase(handle);
  return {
    record: async (event): Promise<void> => {
      await database.insert(auditEvents).values({
        id: Bun.randomUUIDv7(),
        actorUserId: event.actorUserId ?? null,
        actorKind: event.actorKind,
        targetKind: event.targetKind,
        targetId: event.targetId ?? null,
        action: event.action,
        ip: event.ip ?? null,
        payload: sql`${event.payload}::jsonb`,
      });
    },
  };
}
