// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IDENTITY_OUTCOME } from './identity-admin.constant.js';

export type IdentityOutcome<TValue> =
  | { readonly status: typeof IDENTITY_OUTCOME.OK; readonly value: TValue }
  | { readonly status: typeof IDENTITY_OUTCOME.NOT_FOUND }
  | { readonly status: typeof IDENTITY_OUTCOME.CONFLICT }
  | { readonly status: typeof IDENTITY_OUTCOME.UNAVAILABLE };

export type IdentityUser = {
  readonly id: string;
  readonly email: string | undefined;
};

export type SetEnabledParams = {
  readonly userId: string;
  readonly isEnabled: boolean;
};

export type IdentityAdminClient = {
  readonly findUserByEmail: (email: string) => Promise<IdentityOutcome<IdentityUser | undefined>>;
  readonly createUser: (email: string) => Promise<IdentityOutcome<IdentityUser>>;
  readonly verifyRealm: () => Promise<IdentityOutcome<undefined>>;
  readonly deleteUser: (userId: string) => Promise<IdentityOutcome<undefined>>;
  readonly logoutUser: (userId: string) => Promise<IdentityOutcome<undefined>>;
  readonly hasCredentials: (userId: string) => Promise<IdentityOutcome<boolean>>;
  readonly sendInvitation: (userId: string) => Promise<IdentityOutcome<undefined>>;
  readonly readEffectiveRoles: (userId: string) => Promise<IdentityOutcome<readonly string[]>>;
  readonly readEmail: (userId: string) => Promise<IdentityOutcome<string | undefined>>;
  readonly setEnabled: (params: SetEnabledParams) => Promise<IdentityOutcome<undefined>>;
};
