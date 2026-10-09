// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createAuthenticatedUser } from '../apps/api-crypto/src/authentication/authenticated-user.js';
import { USER_ROLE } from '../apps/api-crypto/src/authentication/user-role.constant.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';

const SAMPLE_USER_ID_TEXT = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e';

describe('authenticated user contract', () => {
  test('is immutable, including the roles', () => {
    const authenticatedUser = createAuthenticatedUser({
      userId: userIdFromDatabase(SAMPLE_USER_ID_TEXT),
      keycloakSubject: 'keycloak-subject',
      roles: [USER_ROLE.USER],
    });
    expect(Object.isFrozen(authenticatedUser)).toBe(true);
    expect(Object.isFrozen(authenticatedUser.roles)).toBe(true);
  });

  test('carries no personal data such as e-mail', () => {
    const authenticatedUser = createAuthenticatedUser({
      userId: userIdFromDatabase(SAMPLE_USER_ID_TEXT),
      keycloakSubject: 'keycloak-subject',
      roles: [USER_ROLE.ADMIN, USER_ROLE.USER],
      // @ts-expect-error: e-mail não faz parte do contexto autenticado (ADR 0001 §c)
      email: 'pessoa@example.com',
    });
    expect(Object.keys(authenticatedUser).sort()).toStrictEqual([
      'keycloakSubject',
      'roles',
      'userId',
    ]);
  });
});
