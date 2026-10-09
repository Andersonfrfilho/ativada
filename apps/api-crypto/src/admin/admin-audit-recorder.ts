// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isIP } from 'node:net';

import { AUDIT_ACTOR_KIND, type AuditEventRepository } from '@crypto/database';

import type { AdminActor } from './admin-actor.js';
import type { AuditAction } from './admin.constant.js';
import { auditPayloadSchemas } from './audit-payload.schema.js';

export type AdminAuditEvent = {
  readonly actor: AdminActor;
  readonly action: AuditAction;
  readonly targetKind: string;
  readonly targetId: string;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type AdminAuditRecorder = (event: AdminAuditEvent) => Promise<void>;

export function createAdminAuditRecorder(repository: AuditEventRepository): AdminAuditRecorder {
  return async (event) => {
    const payload = auditPayloadSchemas[event.action].parse(event.payload);
    await repository.record({
      actorUserId: event.actor.userId,
      actorKind: AUDIT_ACTOR_KIND.ADMIN,
      targetKind: event.targetKind,
      targetId: event.targetId,
      action: event.action,
      ip: isIP(event.actor.clientAddress) === 0 ? undefined : event.actor.clientAddress,
      payload,
    });
  };
}
