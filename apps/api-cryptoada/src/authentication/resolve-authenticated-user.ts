// Copyright (c) 2026 Ada Technology. All rights reserved.
import { USER_RESOLUTION_STATUS, type OwnerScope, type UserResolution } from '@cryptoada/database';

import { AccountBlockedError, AccountDeletedError } from './authentication.error.js';
import { createAuthenticatedUser, type AuthenticatedUser } from './authenticated-user.js';
import type { VerifiedAccessToken } from './token-claims.schema.js';

export type UserResolver = (subject: string) => Promise<UserResolution>;

export type ResolvedAuthentication = {
  readonly authenticatedUser: AuthenticatedUser;
  readonly scope: OwnerScope;
};

export type ResolveAuthenticatedUserParams = {
  readonly resolveUser: UserResolver;
  readonly token: VerifiedAccessToken;
};

export async function resolveAuthenticatedUser(
  params: ResolveAuthenticatedUserParams,
): Promise<ResolvedAuthentication> {
  const resolution = await params.resolveUser(params.token.subject);
  if (resolution.status === USER_RESOLUTION_STATUS.DELETED) throw new AccountDeletedError();
  if (resolution.status === USER_RESOLUTION_STATUS.BLOCKED) throw new AccountBlockedError();
  return {
    authenticatedUser: createAuthenticatedUser({
      userId: resolution.userId,
      keycloakSubject: params.token.subject,
      roles: params.token.roles,
    }),
    scope: resolution.scope,
  };
}
