// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAdminAccountRepository } from '../src/admin/admin-account.repository.js';
import type { AccountPageCursor } from '../src/admin/admin-account.types.js';
import { parseAccountId, type AccountId } from '../src/admin/admin-account-id.js';
import { AUDIT_ACTOR_KIND } from '../src/audit/audit-event.constant.js';
import { createAuditEventRepository } from '../src/audit/audit-event.repository.js';
import type { DatabaseHandle } from '../src/database-handle.js';
import { resolveUserBySubject } from '../src/users/resolve-user-by-subject.js';
import { USER_RESOLUTION_STATUS } from '../src/users/user-resolution.constant.js';

const SUBJECTS = ['subject-admin-a', 'subject-admin-b', 'subject-admin-c', 'subject-admin-d'];

export type AdminCheckContext = {
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly assertCondition: (condition: boolean, message: string) => void;
  readonly reportCheck: (message: string) => void;
};

type AuditRow = {
  readonly actor_user_id: string | null;
  readonly ip: string | null;
  readonly payload: string | Record<string, unknown>;
  readonly target_id: string | null;
  readonly payload_type: string;
};

async function resolveAccountIds(handle: DatabaseHandle): Promise<readonly AccountId[]> {
  const accountIds: AccountId[] = [];
  for (const subject of SUBJECTS) {
    const resolution = await resolveUserBySubject(handle, subject);
    if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
    const accountId = parseAccountId(resolution.userId);
    if (accountId === undefined) throw new Error('id inválido');
    accountIds.push(accountId);
  }
  return accountIds;
}

async function checkBlocking(context: AdminCheckContext, ids: readonly AccountId[]): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const accounts = createAdminAccountRepository(handle);
  const [first, second] = ids;
  if (first === undefined || second === undefined) throw new Error('contas ausentes');
  const blocked = await accounts.markBlocked(first);
  const again = await accounts.markBlocked(first);
  assertCondition(blocked?.blockedAt !== undefined, 'bloqueio grava blocked_at');
  assertCondition(
    again?.blockedAt?.getTime() === blocked?.blockedAt?.getTime(),
    'primeiro blocked_at',
  );
  assertCondition((await accounts.findAccount(second))?.blockedAt === undefined, 'só a conta alvo');
  assertCondition((await accounts.markUnblocked(first))?.blockedAt === undefined, 'desbloqueio');
  await client`UPDATE users SET deleted_at = now() WHERE id = ${second}`;
  assertCondition((await accounts.markBlocked(second)) === undefined, 'conta apagada não bloqueia');
  await client`UPDATE users SET deleted_at = NULL WHERE id = ${second}`;
  reportCheck('admin: bloqueio idempotente, desbloqueio e conta apagada intocável');
}

async function checkPagination(
  context: AdminCheckContext,
  ids: readonly AccountId[],
): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const accounts = createAdminAccountRepository(handle);
  await client`UPDATE users SET created_at = '2026-10-01T12:00:00Z' WHERE keycloak_sub LIKE 'subject-admin-%'`;
  const seen: string[] = [];
  let after: AccountPageCursor | undefined;
  for (let page = 0; page < 5; page += 1) {
    const result = await accounts.listAccounts({ after, limit: 2 });
    seen.push(...result.items.map((item) => item.id));
    const last = result.items.at(-1);
    if (!result.hasMore || last === undefined) break;
    after = { createdAt: last.createdAt, id: last.id };
  }
  const expected = [...ids].sort();
  assertCondition(
    seen.filter((id) => ids.some((known) => known === id)).join() === expected.join(),
    'cursor completo',
  );
  assertCondition(new Set(seen).size === seen.length, 'sem repetição entre páginas');
  reportCheck('admin: paginação por cursor percorre cada conta uma vez, mesmo com datas iguais');
}

async function checkAudit(context: AdminCheckContext, ids: readonly AccountId[]): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const [actorId, targetId] = ids;
  const actor = await resolveUserBySubject(handle, SUBJECTS[0] ?? '');
  if (
    actor.status !== USER_RESOLUTION_STATUS.ACTIVE ||
    targetId === undefined ||
    actorId === undefined
  ) {
    throw new Error('ator ausente');
  }
  await createAuditEventRepository(handle).record({
    actorUserId: actor.userId,
    actorKind: AUDIT_ACTOR_KIND.ADMIN,
    targetKind: 'account',
    targetId,
    action: 'account.blocked',
    ip: '203.0.113.9',
    payload: { isIdentityProviderSynced: true },
  });
  const rows: unknown =
    await client`SELECT actor_user_id, host(ip) AS ip, payload, jsonb_typeof(payload) AS payload_type, target_id FROM audit_events`;
  const row = (rows as readonly AuditRow[])[0];
  assertCondition(row?.actor_user_id === actorId && row.ip === '203.0.113.9', 'ator e IP gravados');
  assertCondition(row?.payload_type === 'object', 'payload deve ser objeto jsonb');
  const payload: unknown =
    typeof row?.payload === 'string' ? JSON.parse(row.payload) : row?.payload;
  assertCondition(
    JSON.stringify(payload) === '{"isIdentityProviderSynced":true}',
    'payload gravado',
  );
  await client`UPDATE audit_events SET target_id = NULL, ip = NULL`;
  await client`DELETE FROM users WHERE id = ${actorId}`;
  const after: unknown = await client`SELECT actor_user_id FROM audit_events`;
  assertCondition((after as readonly AuditRow[])[0]?.actor_user_id === null, 'ON DELETE SET NULL');
  reportCheck('audit_events: ator, alvo, IP e payload gravados; apagar o ator anula a referência');
}

export async function checkAdminRepositories(context: AdminCheckContext): Promise<void> {
  const ids = await resolveAccountIds(context.handle);
  await checkBlocking(context, ids);
  await checkPagination(context, ids);
  await checkAudit(context, ids);
}
