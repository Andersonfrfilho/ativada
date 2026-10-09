// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAccountDeletionRepository } from './account/account-deletion.repository.js';
import { createAccountExportRepository } from './account/account-export.repository.js';
import { AUDIT_ACTOR_KIND } from './audit/audit-event.constant.js';
import { createAuditEventRepository } from './audit/audit-event.repository.js';
import type { DatabaseHandle } from './database-handle.js';
import type { OwnerScope } from './ownership/owner-scope.js';
import { createTelegramLinkRepository } from './telegram/telegram-link.repository.js';
import { resolveUserBySubject } from './users/resolve-user-by-subject.js';
import { USER_RESOLUTION_STATUS } from './users/user-resolution.constant.js';
import type { UserId } from './ownership/user-id.js';

export const LIFECYCLE_SUBJECT_A = 'subject-lifecycle-a';
export const LIFECYCLE_SUBJECT_B = 'subject-lifecycle-b';
export const LIFECYCLE_ADMIN_SUBJECT = 'subject-lifecycle-admin';
const NAME_OF_A = 'Lifecycle Owner A';
const NAME_OF_B = 'Lifecycle Owner B';
const CHAT_OF_A = '720000001';
const CHAT_OF_B = '720000002';
const IP_OF_A = '203.0.113.21';
const IP_OF_B = '203.0.113.22';
const IP_OF_ADMIN = '198.51.100.23';
const TEN_MINUTES_MILLISECONDS = 600_000;

export type LifecycleCheckContext = {
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly assertCondition: (condition: boolean, message: string) => void;
  readonly reportCheck: (message: string) => void;
};

export type LifecycleOwner = { readonly userId: UserId; readonly scope: OwnerScope };

export type LifecycleOwners = {
  readonly ownerA: LifecycleOwner;
  readonly ownerB: LifecycleOwner;
  readonly adminId: UserId;
};

type DeletedRow = { readonly deleted_at: Date | null };

async function resolveOwner(handle: DatabaseHandle, subject: string): Promise<LifecycleOwner> {
  const resolution = await resolveUserBySubject(handle, subject);
  if (resolution.status !== USER_RESOLUTION_STATUS.ACTIVE) throw new Error('usuário não ativo');
  return { userId: resolution.userId, scope: resolution.scope };
}

async function seedOwner(
  context: LifecycleCheckContext,
  params: { readonly owner: LifecycleOwner; readonly name: string; readonly chat: string },
): Promise<void> {
  const { client, handle } = context;
  const { owner, name, chat } = params;
  await client`UPDATE users SET display_name = ${name}, telegram_chat_id = ${chat} WHERE id = ${owner.userId}`;
  await createTelegramLinkRepository(handle).issueCode(owner.scope, {
    codeHash: `hash-of-${owner.userId}`,
    expiresAt: new Date(Date.now() + TEN_MINUTES_MILLISECONDS),
  });
}

async function seedAudit(context: LifecycleCheckContext, owners: LifecycleOwners): Promise<void> {
  const audit = createAuditEventRepository(context.handle);
  const { ownerA, ownerB, adminId } = owners;
  const base = { targetKind: 'account', payload: {} } as const;
  await audit.record({
    ...base,
    actorUserId: ownerA.userId,
    actorKind: AUDIT_ACTOR_KIND.USER,
    targetId: ownerA.userId,
    action: 'account.deletion_requested',
    ip: IP_OF_A,
  });
  await audit.record({
    ...base,
    actorUserId: adminId,
    actorKind: AUDIT_ACTOR_KIND.ADMIN,
    targetId: ownerA.userId,
    action: 'account.blocked',
    ip: IP_OF_ADMIN,
  });
  await audit.record({
    ...base,
    actorUserId: ownerB.userId,
    actorKind: AUDIT_ACTOR_KIND.USER,
    targetId: ownerB.userId,
    action: 'account.deletion_requested',
    ip: IP_OF_B,
  });
}

export async function seedLifecycleOwners(
  context: LifecycleCheckContext,
): Promise<LifecycleOwners> {
  const ownerA = await resolveOwner(context.handle, LIFECYCLE_SUBJECT_A);
  const ownerB = await resolveOwner(context.handle, LIFECYCLE_SUBJECT_B);
  const admin = await resolveOwner(context.handle, LIFECYCLE_ADMIN_SUBJECT);
  await seedOwner(context, { owner: ownerA, name: NAME_OF_A, chat: CHAT_OF_A });
  await seedOwner(context, { owner: ownerB, name: NAME_OF_B, chat: CHAT_OF_B });
  const owners = { ownerA, ownerB, adminId: admin.userId };
  await seedAudit(context, owners);
  return owners;
}

export async function checkExport(
  context: LifecycleCheckContext,
  owners: LifecycleOwners,
): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const exports = createAccountExportRepository(handle);
  const data = await exports.exportOwnerData(owners.ownerA.scope);
  if (data === undefined) throw new Error('exportação de A vazia');
  const text = JSON.stringify(data);
  assertCondition(data.account['displayName'] === NAME_OF_A, 'perfil de A na exportação');
  assertCondition(data.account['telegramChatId'] === CHAT_OF_A, 'chat de A na exportação');
  const codes = data.tables['telegram_link_codes'] ?? [];
  assertCondition(codes.length === 1, `códigos de A na exportação: ${codes.length}`);
  for (const foreign of [NAME_OF_B, CHAT_OF_B, owners.ownerB.userId, IP_OF_B, IP_OF_ADMIN]) {
    assertCondition(!text.includes(foreign), `a exportação de A vazou ${foreign}`);
  }
  for (const secret of ['codeHash', 'code_hash', 'hash-of-', 'keycloak', LIFECYCLE_SUBJECT_A]) {
    assertCondition(!text.includes(secret), `a exportação carregou ${secret}`);
  }
  const { asActor, asTarget } = data.auditEvents;
  assertCondition(asActor.length === 1 && asActor[0]?.['ip'] === IP_OF_A, 'auditoria como ator');
  assertCondition(
    asTarget.length === 1 && !('ip' in (asTarget[0] ?? {})) && !text.includes(owners.adminId),
    'auditoria como alvo não pode trazer o IP nem o id do outro ator',
  );
  reportCheck('exportação: só os dados de A, sem hash, sem keycloak_sub, sem IP nem ator alheios');
}

export async function checkMarkDeleted(
  context: LifecycleCheckContext,
  owners: LifecycleOwners,
): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const deletions = createAccountDeletionRepository(handle);
  const first = await deletions.markDeleted(owners.ownerA.scope);
  const second = await deletions.markDeleted(owners.ownerA.scope);
  assertCondition(
    first !== undefined && second?.getTime() === first.getTime(),
    'passo 1 idempotente',
  );
  const rows: unknown =
    await client`SELECT deleted_at FROM users WHERE id = ${owners.ownerB.userId}`;
  assertCondition(
    (rows as readonly DeletedRow[])[0]?.deleted_at === null,
    'B não pode ser marcado',
  );
  reportCheck('passo 1: deleted_at gravado uma vez no dono; o outro usuário fica intacto');
}
