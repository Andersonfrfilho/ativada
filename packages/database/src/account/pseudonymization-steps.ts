// Copyright (c) 2026 Ada Technology. All rights reserved.
import { eq, getTableName, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import type { UserId } from '../ownership/user-id.js';
import { auditEvents } from '../schema/audit-events.schema.js';

export type PseudonymizationExecutor = Pick<BunSQLDatabase, 'update'>;

export type PseudonymizationStep = (
  executor: PseudonymizationExecutor,
  userId: UserId,
) => Promise<void>;

// A linha e a ação ficam; só o que aponta para a pessoa vira NULL. O IP é de quem agiu: quando o
// usuário é só o alvo de uma ação do admin, o IP é do admin e segue até a retenção de 90 dias.
const pseudonymizeAuditEvents: PseudonymizationStep = async (executor, userId) => {
  const nullWhenOwner = (column: AnyColumn): SQL =>
    sql`case when ${column} = ${userId} then null else ${column} end`;
  await executor
    .update(auditEvents)
    .set({
      ip: sql`case when ${auditEvents.actorUserId} = ${userId} then null else ${auditEvents.ip} end`,
      actorUserId: nullWhenOwner(auditEvents.actorUserId),
      targetId: nullWhenOwner(auditEvents.targetId),
    })
    .where(or(eq(auditEvents.actorUserId, userId), eq(auditEvents.targetId, userId)));
};

// Uma entrada por tabela de PSEUDONYMIZED_TABLES; o contrato do registro cobra a correspondência.
export const PSEUDONYMIZATION_STEPS: Readonly<Record<string, PseudonymizationStep>> = {
  [getTableName(auditEvents)]: pseudonymizeAuditEvents,
};
