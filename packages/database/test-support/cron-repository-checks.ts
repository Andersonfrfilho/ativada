// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseAccountId, type AccountId } from '../src/admin/admin-account-id.js';
import { createBlockedAccountRepository } from '../src/account/blocked-account.repository.js';
import { createAuditRetentionRepository } from '../src/audit/audit-retention.repository.js';
import type { DatabaseHandle } from '../src/database-handle.js';
import { resolveUserBySubject } from '../src/users/resolve-user-by-subject.js';
import { USER_RESOLUTION_STATUS } from '../src/users/user-resolution.constant.js';

const BLOCKED_SUBJECTS = ['subject-cron-a', 'subject-cron-b', 'subject-cron-c'];
const UNBLOCKED_SUBJECT = 'subject-cron-free';
const DELETED_BLOCKED_SUBJECT = 'subject-cron-deleted';
const RETENTION_DAYS = 730;
const RETENTION_ACTION = 'cron.retention.probe';

export type CronCheckContext = {
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly assertCondition: (condition: boolean, message: string) => void;
  readonly reportCheck: (message: string) => void;
};

type CountRow = { readonly total: number };

async function resolveAccountId(handle: DatabaseHandle, subject: string): Promise<AccountId> {
  const resolution = await resolveUserBySubject(handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  const accountId = parseAccountId(resolution.userId);
  if (accountId === undefined) throw new Error('id inválido');
  return accountId;
}

export async function checkBlockedAccounts(context: CronCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const blockedIds = await Promise.all(BLOCKED_SUBJECTS.map((s) => resolveAccountId(handle, s)));
  const unblockedId = await resolveAccountId(handle, UNBLOCKED_SUBJECT);
  const deletedId = await resolveAccountId(handle, DELETED_BLOCKED_SUBJECT);
  await client`UPDATE users SET blocked_at = now() WHERE keycloak_sub LIKE 'subject-cron-%' AND keycloak_sub <> ${UNBLOCKED_SUBJECT}`;
  await client`UPDATE users SET deleted_at = now() WHERE id = ${deletedId}`;
  const repository = createBlockedAccountRepository(handle);
  const seen: AccountId[] = [];
  let after: AccountId | undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await repository.listBlockedAccounts({ limit: 2, after });
    seen.push(...result.accounts.map((account) => account.id));
    after = result.nextCursor;
    if (after === undefined) break;
  }
  const ours = seen.filter((id) => blockedIds.includes(id));
  assertCondition(ours.join() === [...blockedIds].sort().join(), 'bloqueadas e vivas, em ordem');
  assertCondition(new Set(seen).size === seen.length, 'sem repetição entre páginas');
  assertCondition(seen.join() === [...seen].sort().join(), 'ordem crescente de id');
  assertCondition(!seen.includes(unblockedId) && !seen.includes(deletedId), 'filtros');
  const [first] = blockedIds;
  assertCondition(
    first !== undefined && (await repository.isStillBlocked(first)),
    'segue bloqueada',
  );
  assertCondition(!(await repository.isStillBlocked(unblockedId)), 'conta livre');
  assertCondition(!(await repository.isStillBlocked(deletedId)), 'conta apagada');
  reportCheck('cron: contas bloqueadas listadas por cursor, sem as livres nem as apagadas');
}

async function insertEventDaysAgo(client: Bun.SQL, daysAgo: number): Promise<void> {
  const id = crypto.randomUUID();
  await client`INSERT INTO audit_events (id, actor_kind, target_kind, action, created_at) VALUES (${id}, 'system', 'account', ${RETENTION_ACTION}, now() - make_interval(days => ${daysAgo}))`;
}

export async function checkAuditRetention(context: CronCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  for (const daysAgo of [RETENTION_DAYS + 400, RETENTION_DAYS + 1, RETENTION_DAYS - 1, 1]) {
    await insertEventDaysAgo(client, daysAgo);
  }
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const deleted = await createAuditRetentionRepository(handle).deleteEventsOlderThan(cutoff);
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM audit_events WHERE action = ${RETENTION_ACTION}`;
  const remaining = (rows as readonly CountRow[])[0]?.total ?? -1;
  assertCondition(deleted >= 2, `apagou ${deleted}, esperado ao menos as 2 vencidas`);
  assertCondition(remaining === 2, `restaram ${remaining} eventos de teste, esperado 2`);
  reportCheck('cron: audit_events com mais de 730 dias apagados, os mais novos intactos');
}
