// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  AUDIT_ACTOR_KIND,
  type AccountDeletionRepository,
  type AuditEventRepository,
  type OwnerScope,
} from '@cryptoada/database';
import type { IdentityAdminClient } from '@cryptoada/identity-admin';

import { AUDIT_TARGET_KIND } from '../admin/admin.constant.js';
import { assertRecentAuthentication } from '../authentication/recent-authentication.js';
import type { AuthenticatedUser } from '../authentication/authenticated-user.js';
import { toAuditIp } from '../audit/audit-client-address.js';
import { ProfileNotFoundError } from '../profile/profile.error.js';
import { ACCOUNT_AUDIT_ACTION, DELETION_STATUS } from './account.constant.js';

export type DeleteAccountInput = {
  readonly authenticatedUser: AuthenticatedUser;
  readonly scope: OwnerScope;
  readonly authenticationTime: number | undefined;
  readonly clientAddress: string;
};

export type DeleteAccountResult = {
  readonly status: typeof DELETION_STATUS.STARTED;
};

export type DeleteAccountUseCase = (input: DeleteAccountInput) => Promise<DeleteAccountResult>;

export type DeleteAccountDependencies = {
  readonly deletions: AccountDeletionRepository;
  readonly audit: AuditEventRepository;
  readonly identity: IdentityAdminClient;
  readonly now: () => number;
};

// Passo 1 do ADR 0001 §h. Os passos 2 e 3 (apagar no Keycloak e purgar os dados) são do cron.
export function createDeleteAccountUseCase(
  dependencies: DeleteAccountDependencies,
): DeleteAccountUseCase {
  return async (input) => {
    assertRecentAuthentication({
      authenticationTime: input.authenticationTime,
      nowMilliseconds: dependencies.now(),
    });
    const { userId, keycloakSubject } = input.authenticatedUser;
    await dependencies.audit.record({
      actorUserId: userId,
      actorKind: AUDIT_ACTOR_KIND.USER,
      targetKind: AUDIT_TARGET_KIND.ACCOUNT,
      targetId: userId,
      action: ACCOUNT_AUDIT_ACTION.DELETION_REQUESTED,
      ip: toAuditIp(input.clientAddress),
      payload: {},
    });
    const deletedAt = await dependencies.deletions.markDeleted(input.scope);
    if (deletedAt === undefined) throw new ProfileNotFoundError();
    // Melhor esforço: o passo 2 do cron apaga o usuário e derruba as sessões de qualquer forma.
    await dependencies.identity.logoutUser(keycloakSubject);
    return { status: DELETION_STATUS.STARTED };
  };
}
