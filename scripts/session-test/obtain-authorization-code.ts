// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createPkcePair,
  readAuthorizationCode,
  startLogin,
  submitLoginForm,
  type LoginStep,
  type PkcePair,
} from '../identity-test/browser-login.js';
import type { IdentityContext } from '../identity-test/identity-context.js';
import { IdentityTestError } from '../identity-test/identity-test.error.js';
import { createTestUser, TEST_USER_PASSWORD } from '../identity-test/test-users.js';
import { SESSION_CLIENT_ID } from './session-test.constant.js';

export type AuthorizationGrant = {
  readonly code: string;
  readonly pkce: PkcePair;
};

function expectPage(step: LoginStep): Extract<LoginStep, { kind: 'page' }> {
  if (step.kind !== 'page') throw new IdentityTestError('o login não abriu o formulário');
  return step;
}

export async function obtainAuthorizationCode(
  context: IdentityContext,
): Promise<AuthorizationGrant> {
  const user = await createTestUser({
    environment: context.environment,
    cleanup: context.cleanup,
    kind: 'user',
  });
  const pkce = createPkcePair();
  const loginPage = expectPage(
    await startLogin({ environment: context.environment, pkce, clientId: SESSION_CLIENT_ID }),
  );
  const outcome = await submitLoginForm(loginPage, {
    username: user.username,
    password: TEST_USER_PASSWORD,
    credentialId: '',
  });
  if (outcome.kind !== 'redirect') throw new IdentityTestError('o login pediu uma etapa extra');
  return { code: readAuthorizationCode(outcome.location), pkce };
}
