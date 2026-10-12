// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AdminAccountRepository } from '@ativada/database';
import {
  IDENTITY_OUTCOME,
  type IdentityAdminClient,
  type IdentityUser,
} from '@ativada/identity-admin';

import type { AdminActor } from './admin-actor.js';
import type { AdminAuditRecorder } from './admin-audit-recorder.js';
import { AUDIT_ACTION, AUDIT_TARGET_KIND } from './admin.constant.js';
import { AccountAlreadyActiveError } from './admin.error.js';
import { requireDone, requireValue } from './identity-outcome-guard.js';

export type InviteUserDependencies = {
  readonly identity: IdentityAdminClient;
  readonly accounts: Pick<AdminAccountRepository, 'findAccountBySubject'>;
  readonly audit: AdminAuditRecorder;
};

export type InviteUserInput = {
  readonly email: string;
  readonly actor: AdminActor;
};

export type InviteUserResult = { readonly isResend: boolean };

export type InviteUserUseCase = (input: InviteUserInput) => Promise<InviteUserResult>;

async function discardPendingInvitee(
  dependencies: InviteUserDependencies,
  existing: IdentityUser,
): Promise<void> {
  const hasCredentials = requireValue(await dependencies.identity.hasCredentials(existing.id));
  const account = await dependencies.accounts.findAccountBySubject(existing.id);
  if (hasCredentials || account !== undefined) throw new AccountAlreadyActiveError();
  requireDone(await dependencies.identity.deleteUser(existing.id));
}

async function createInvitee(identity: IdentityAdminClient, email: string): Promise<IdentityUser> {
  const created = await identity.createUser(email);
  if (created.status === IDENTITY_OUTCOME.CONFLICT) throw new AccountAlreadyActiveError();
  return requireValue(created);
}

export function createInviteUserUseCase(dependencies: InviteUserDependencies): InviteUserUseCase {
  const { identity, audit } = dependencies;
  return async ({ email, actor }) => {
    const existing = requireValue(await identity.findUserByEmail(email));
    const isResend = existing !== undefined;
    if (existing !== undefined) await discardPendingInvitee(dependencies, existing);
    const invitee = await createInvitee(identity, email);
    requireDone(await identity.sendInvitation(invitee.id));
    await audit({
      actor,
      action: AUDIT_ACTION.INVITATION_SENT,
      targetKind: AUDIT_TARGET_KIND.INVITATION,
      targetId: invitee.id,
      payload: { isResend },
    });
    return { isResend };
  };
}
