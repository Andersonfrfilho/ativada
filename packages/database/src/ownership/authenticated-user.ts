// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UserId } from './user-id.js';
import type { UserRole } from './user-role.constant.js';

export type AuthenticatedUser = {
  readonly userId: UserId;
  readonly keycloakSubject: string;
  readonly email: string;
  readonly roles: readonly UserRole[];
};

export function createAuthenticatedUser(params: AuthenticatedUser): AuthenticatedUser {
  return Object.freeze({
    userId: params.userId,
    keycloakSubject: params.keycloakSubject,
    email: params.email,
    roles: Object.freeze([...params.roles]),
  });
}
