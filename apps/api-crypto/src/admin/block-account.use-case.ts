// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AccountId, AdminAccountRecord, AdminAccountRepository } from '@crypto/database';

import { IDENTITY_OUTCOME } from '../identity-admin/identity-admin.constant.js';
import type { IdentityAdminClient } from '../identity-admin/identity-admin.types.js';
import { USER_ROLE } from '../authentication/user-role.constant.js';
import type { AdminActor } from './admin-actor.js';
import type { AdminAuditRecorder } from './admin-audit-recorder.js';
import { AUDIT_ACTION, AUDIT_TARGET_KIND } from './admin.constant.js';
import {
  AccountNotFoundError,
  CannotBlockAdminError,
  CannotBlockSelfError,
} from './admin.error.js';
import { requireDone, requireValue } from './identity-outcome-guard.js';

export type AccountStateDependencies = {
  readonly accounts: AdminAccountRepository;
  readonly identity: IdentityAdminClient;
  readonly audit: AdminAuditRecorder;
};

export type AccountStateInput = {
  readonly accountId: AccountId;
  readonly actor: AdminActor;
};

export type AccountStateResult = {
  readonly accountId: AccountId;
  readonly isBlocked: boolean;
  readonly isIdentityProviderSynced: boolean;
};

export type AccountStateUseCase = (input: AccountStateInput) => Promise<AccountStateResult>;

export async function requireActiveAccount(
  accounts: AdminAccountRepository,
  accountId: AccountId,
): Promise<AdminAccountRecord> {
  const account = await accounts.findAccount(accountId);
  if (account === undefined || account.deletedAt !== undefined) throw new AccountNotFoundError();
  return account;
}

async function assertBlockable(
  dependencies: AccountStateDependencies,
  input: AccountStateInput & { readonly account: AdminAccountRecord },
): Promise<void> {
  const actorId: string = input.actor.userId;
  if (actorId === input.accountId) throw new CannotBlockSelfError();
  const outcome = await dependencies.identity.readEffectiveRoles(input.account.keycloakSubject);
  if (outcome.status === IDENTITY_OUTCOME.NOT_FOUND) return;
  if (requireValue(outcome).includes(USER_ROLE.ADMIN)) throw new CannotBlockAdminError();
}

export function createBlockAccountUseCase(
  dependencies: AccountStateDependencies,
): AccountStateUseCase {
  const { accounts, identity, audit } = dependencies;
  return async (input) => {
    const account = await requireActiveAccount(accounts, input.accountId);
    await assertBlockable(dependencies, { ...input, account });
    const blocked = await accounts.markBlocked(input.accountId);
    if (blocked === undefined) throw new AccountNotFoundError();
    const disabled = await identity.setEnabled({
      userId: account.keycloakSubject,
      isEnabled: false,
    });
    const isIdentityProviderSynced = disabled.status !== IDENTITY_OUTCOME.UNAVAILABLE;
    await audit({
      actor: input.actor,
      action: AUDIT_ACTION.ACCOUNT_BLOCKED,
      targetKind: AUDIT_TARGET_KIND.ACCOUNT,
      targetId: input.accountId,
      payload: { isIdentityProviderSynced },
    });
    return { accountId: input.accountId, isBlocked: true, isIdentityProviderSynced };
  };
}

export function createUnblockAccountUseCase(
  dependencies: AccountStateDependencies,
): AccountStateUseCase {
  const { accounts, identity, audit } = dependencies;
  return async (input) => {
    const account = await requireActiveAccount(accounts, input.accountId);
    requireDone(await identity.setEnabled({ userId: account.keycloakSubject, isEnabled: true }));
    const unblocked = await accounts.markUnblocked(input.accountId);
    if (unblocked === undefined) throw new AccountNotFoundError();
    await audit({
      actor: input.actor,
      action: AUDIT_ACTION.ACCOUNT_UNBLOCKED,
      targetKind: AUDIT_TARGET_KIND.ACCOUNT,
      targetId: input.accountId,
      payload: {},
    });
    return { accountId: input.accountId, isBlocked: false, isIdentityProviderSynced: true };
  };
}
