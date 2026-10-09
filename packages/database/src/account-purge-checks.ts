// Copyright (c) 2026 Ada Technology. All rights reserved.
import { AccountNotDeletedError } from './account/account-purge.error.js';
import { createAccountPurgeRepository } from './account/account-purge.repository.js';
import type { LifecycleCheckContext, LifecycleOwners } from './account-lifecycle-checks.js';

const MILLISECONDS_PER_DAY = 86_400_000;
const IP_OF_A = '203.0.113.21';
const IP_OF_B = '203.0.113.22';
const IP_OF_ADMIN = '198.51.100.23';

type CountRow = { readonly total: number };
type UserRow = {
  readonly display_name: string | null;
  readonly telegram_chat_id: string | null;
  readonly identity_deleted_at: Date | null;
  readonly data_purged_at: Date | null;
};
type AuditRow = {
  readonly actor_user_id: string | null;
  readonly target_id: string | null;
  readonly ip: string | null;
  readonly action: string;
};

async function countOf(query: Promise<unknown>): Promise<number> {
  return ((await query) as readonly CountRow[])[0]?.total ?? 0;
}

async function readUser(client: Bun.SQL, userId: string): Promise<UserRow | undefined> {
  const rows: unknown =
    await client`SELECT display_name, telegram_chat_id, identity_deleted_at, data_purged_at FROM users WHERE id = ${userId}`;
  return (rows as readonly UserRow[])[0];
}

async function readAudit(client: Bun.SQL): Promise<readonly AuditRow[]> {
  const rows: unknown =
    await client`SELECT actor_user_id, target_id, host(ip) AS ip, action FROM audit_events WHERE action IN ('account.deletion_requested', 'account.blocked') ORDER BY created_at, id`;
  return rows as readonly AuditRow[];
}

export async function checkPurge(
  context: LifecycleCheckContext,
  owners: LifecycleOwners,
): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const purge = createAccountPurgeRepository(handle);
  const pending = await purge.listAccountsPendingPurge({ limit: 100 });
  const pendingSubjects = pending.map((account) => account.keycloakSubject);
  assertCondition(
    pendingSubjects.includes('subject-lifecycle-a') &&
      !pendingSubjects.includes('subject-lifecycle-b'),
    'a lista de pendentes traz só contas apagadas',
  );
  let refusal: unknown;
  try {
    await purge.purgeAccountData(owners.ownerB.scope);
  } catch (error: unknown) {
    refusal = error;
  }
  assertCondition(refusal instanceof AccountNotDeletedError, 'conta ativa não pode ser purgada');
  assertCondition(
    (await readUser(client, owners.ownerB.userId))?.display_name !== null,
    'B intacto',
  );

  const auditBefore = (await readAudit(client)).length;
  await purge.purgeAccountData(owners.ownerA.scope);
  await purge.purgeAccountData(owners.ownerA.scope);
  const userA = await readUser(client, owners.ownerA.userId);
  assertCondition(userA?.display_name === null && userA.telegram_chat_id === null, 'A anonimizado');
  assertCondition(userA?.data_purged_at !== null, 'data_purged_at gravado');
  assertCondition(userA?.identity_deleted_at === null, 'passo 2 ainda não feito');
  const codesOfA = await countOf(
    client`SELECT count(*)::int AS total FROM telegram_link_codes WHERE user_id = ${owners.ownerA.userId}`,
  );
  const codesOfB = await countOf(
    client`SELECT count(*)::int AS total FROM telegram_link_codes WHERE user_id = ${owners.ownerB.userId}`,
  );
  assertCondition(codesOfA === 0 && codesOfB === 1, `códigos de A=${codesOfA} e de B=${codesOfB}`);
  const audit = await readAudit(client);
  assertCondition(
    audit.length === auditBefore,
    `audit_events não pode ser apagada: ${audit.length}/${auditBefore}`,
  );
  const noReference = (row: AuditRow): boolean =>
    row.actor_user_id !== owners.ownerA.userId && row.target_id !== owners.ownerA.userId;
  assertCondition(audit.every(noReference), 'nenhuma linha pode apontar para A');
  assertCondition(!audit.some((row) => row.ip === IP_OF_A), 'o IP de A foi anulado');
  assertCondition(
    audit.some((row) => row.ip === IP_OF_ADMIN && row.action === 'account.blocked'),
    'o IP do admin não é de A e fica',
  );
  assertCondition(
    audit.some((row) => row.actor_user_id === owners.ownerB.userId && row.ip === IP_OF_B),
    'a auditoria de B fica intacta',
  );
  reportCheck(
    'passo 3: dados de A apagados em ordem, audit_events pseudonimizada e não apagada, B intacto',
  );
}

export async function checkRemoveAndRetention(
  context: LifecycleCheckContext,
  owners: LifecycleOwners,
): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const purge = createAccountPurgeRepository(handle);
  const future = new Date(Date.now() + MILLISECONDS_PER_DAY);
  const past = new Date(Date.now() - MILLISECONDS_PER_DAY);
  const auditBefore = (await readAudit(client)).length;
  assertCondition(
    !(await purge.removeUserRow(owners.ownerA.scope, { deletedBefore: future })),
    'sem passo 2',
  );
  await purge.markIdentityDeleted(owners.ownerA.scope);
  await purge.markIdentityDeleted(owners.ownerA.scope);
  assertCondition(
    !(await purge.removeUserRow(owners.ownerA.scope, { deletedBefore: past })),
    'carência',
  );
  assertCondition(
    !(await purge.removeUserRow(owners.ownerB.scope, { deletedBefore: future })),
    'B ativo',
  );
  assertCondition(
    await purge.removeUserRow(owners.ownerA.scope, { deletedBefore: future }),
    'remoção',
  );
  assertCondition(
    (await readUser(client, owners.ownerA.userId)) === undefined,
    'linha de A removida',
  );
  assertCondition((await readUser(client, owners.ownerB.userId)) !== undefined, 'linha de B fica');
  assertCondition(
    (await readAudit(client)).length === auditBefore,
    'a remoção não apaga a auditoria',
  );
  reportCheck('passo 4: a linha só sai com as duas colunas e depois da carência; auditoria fica');

  await client`INSERT INTO audit_events (id, actor_kind, target_kind, action, ip, created_at, payload)
    VALUES (${Bun.randomUUIDv7()}, 'system', 'account', 'retention.probe', '203.0.113.99', now() - interval '100 days', '{}'::jsonb)`;
  const cutoff = new Date(Date.now() - 90 * MILLISECONDS_PER_DAY);
  const expired = await purge.expireAuditIps(cutoff);
  const probe: unknown =
    await client`SELECT host(ip) AS ip FROM audit_events WHERE action = 'retention.probe'`;
  assertCondition(expired >= 1 && (probe as readonly AuditRow[])[0]?.ip === null, 'IP de 100 dias');
  assertCondition(
    (await readAudit(client)).some((row) => row.ip === IP_OF_B),
    'IP recente fica',
  );
  reportCheck('retenção: IP com mais de 90 dias anulado; linhas recentes intactas');
}
