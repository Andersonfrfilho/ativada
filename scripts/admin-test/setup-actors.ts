// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createTestUser } from '../identity-test/test-users.js';
import type { AdminTestContext, Actor, TestActors } from './admin-test-context.js';
import { loginThroughApi } from './admin-login.js';
import { ME_PATH } from './admin-test.constant.js';
import { requestApi } from './api-request.js';
import { assertCondition } from '../identity-test/identity-test.error.js';

type ActorKind = 'user' | 'admin-with-otp';

async function createActor(
  context: AdminTestContext,
  kind: ActorKind,
  acrValues: string | undefined,
): Promise<Actor> {
  const { identity, api } = context;
  const user = await createTestUser({
    environment: identity.environment,
    cleanup: identity.cleanup,
    kind,
  });
  const redirectUri = api.environment.SESSION_ALLOWED_REDIRECT_URIS[0] ?? '';
  const accessToken = await loginThroughApi({
    identity,
    baseUrl: api.baseUrl,
    redirectUri,
    user,
    ...(acrValues === undefined ? {} : { acrValues }),
  });
  const me = await requestApi({ baseUrl: api.baseUrl, path: ME_PATH, token: accessToken });
  assertCondition(me.status === 200, `GET /v1/me do ator ${kind}: ${me.status} ${me.text}`);
  return { username: user.username, email: user.email, keycloakId: user.id, accessToken };
}

async function loginWithoutMfa(context: AdminTestContext, actor: Actor): Promise<string> {
  const { identity, api } = context;
  return loginThroughApi({
    identity,
    baseUrl: api.baseUrl,
    redirectUri: api.environment.SESSION_ALLOWED_REDIRECT_URIS[0] ?? '',
    user: { id: actor.keycloakId, username: actor.username, email: actor.email },
  });
}

export async function setUpActors(context: AdminTestContext): Promise<TestActors> {
  const admin = await createActor(context, 'admin-with-otp', '2');
  const otherAdmin = await createActor(context, 'admin-with-otp', '2');
  const member = await createActor(context, 'user', undefined);
  return { admin, otherAdmin, member, adminWithoutMfaToken: await loginWithoutMfa(context, admin) };
}
