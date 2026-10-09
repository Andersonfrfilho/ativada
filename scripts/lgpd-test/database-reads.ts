// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AuditSnapshot, LgpdContext } from './lgpd-test-context.js';

type IdRow = { readonly id: string };
type CountRow = { readonly total: number };

export type UserRowView = {
  readonly display_name: string | null;
  readonly telegram_chat_id: string | null;
  readonly deleted_at: Date | null;
  readonly identity_deleted_at: Date | null;
  readonly data_purged_at: Date | null;
  readonly limits: unknown;
};

export async function readUserId(context: LgpdContext, keycloakId: string): Promise<string> {
  const rows: unknown = await context.sql`SELECT id FROM users WHERE keycloak_sub = ${keycloakId}`;
  const id = (rows as readonly IdRow[])[0]?.id;
  if (id === undefined) throw new Error('usuário sem linha em users');
  return id;
}

export async function readUserRow(
  context: LgpdContext,
  userId: string,
): Promise<UserRowView | undefined> {
  const rows: unknown = await context.sql`
    SELECT display_name, telegram_chat_id, deleted_at, identity_deleted_at, data_purged_at, limits
    FROM users WHERE id = ${userId}`;
  return (rows as readonly UserRowView[])[0];
}

export async function countLinkCodes(context: LgpdContext, userId: string): Promise<number> {
  const rows: unknown =
    await context.sql`SELECT count(*)::int AS total FROM telegram_link_codes WHERE user_id = ${userId}`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

export async function countAuditReferences(context: LgpdContext, userId: string): Promise<number> {
  const rows: unknown = await context.sql`
    SELECT count(*)::int AS total FROM audit_events
    WHERE actor_user_id = ${userId} OR target_id = ${userId}`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

export async function snapshotAudit(
  context: LgpdContext,
  params: { readonly userIdOfA: string; readonly userIdOfB: string },
): Promise<AuditSnapshot> {
  const total: unknown = await context.sql`SELECT count(*)::int AS total FROM audit_events`;
  const adminRows: unknown = await context.sql`
    SELECT count(*)::int AS total FROM audit_events
    WHERE target_id = ${params.userIdOfA} AND actor_kind = 'admin'`;
  return {
    total: (total as readonly CountRow[])[0]?.total ?? 0,
    referencingB: await countAuditReferences(context, params.userIdOfB),
    adminRowsOfA: (adminRows as readonly CountRow[])[0]?.total ?? 0,
  };
}

export async function countNullActorRows(context: LgpdContext, action: string): Promise<number> {
  const rows: unknown = await context.sql`
    SELECT count(*)::int AS total FROM audit_events
    WHERE action = ${action} AND actor_user_id IS NULL AND target_id IS NULL AND ip IS NULL`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}
