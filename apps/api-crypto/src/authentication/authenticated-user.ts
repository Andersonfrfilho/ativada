// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UserId } from '@crypto/database';

import type { UserRole } from './user-role.constant.js';

// Sem e-mail: dado pessoal fica fora do contexto que atravessa a requisição e chega ao log (ADR 0001 §c).
export type AuthenticatedUser = {
  readonly userId: UserId;
  readonly keycloakSubject: string;
  readonly roles: readonly UserRole[];
};

export function createAuthenticatedUser(params: AuthenticatedUser): AuthenticatedUser {
  return Object.freeze({
    userId: params.userId,
    keycloakSubject: params.keycloakSubject,
    roles: Object.freeze([...params.roles]),
  });
}
