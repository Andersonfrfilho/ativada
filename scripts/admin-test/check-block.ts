// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import type { TestUser } from '../identity-test/test-users.js';
import { attemptLoginRedirects } from './admin-login.js';
import { ACCOUNTS_PATH, ME_PATH } from './admin-test.constant.js';
import {
  reportAdminStep,
  type Actor,
  type AdminTestContext,
  type TestActors,
} from './admin-test-context.js';
import { readData, readErrorCode, requestApi, type ApiAnswer } from './api-request.js';
import { readKeycloakUser } from './keycloak-reads.js';

type BlockedRow = { readonly blocked_at: Date | null };

function toTestUser(actor: Actor): TestUser {
  return { id: actor.keycloakId, username: actor.username, email: actor.email };
}

async function findAccountId(
  context: AdminTestContext,
  params: { readonly actors: TestActors; readonly email: string },
): Promise<string> {
  const listing = await requestApi({
    baseUrl: context.api.baseUrl,
    path: `${ACCOUNTS_PATH}?limit=100`,
    token: params.actors.admin.accessToken,
  });
  const items = (listing.json['data'] as readonly Record<string, unknown>[]) ?? [];
  const found = items.find((item) => item['email'] === params.email);
  assertCondition(found !== undefined, 'conta não encontrada na listagem');
  return String(found['id']);
}

async function readBlockedAt(context: AdminTestContext, accountId: string): Promise<Date | null> {
  const rows: unknown = await context.sql`SELECT blocked_at FROM users WHERE id = ${accountId}`;
  return (rows as readonly BlockedRow[])[0]?.blocked_at ?? null;
}

function postAction(
  context: AdminTestContext,
  params: { readonly actors: TestActors; readonly accountId: string; readonly action: string },
): Promise<ApiAnswer> {
  return requestApi({
    baseUrl: context.api.baseUrl,
    path: `${ACCOUNTS_PATH}/${params.accountId}/${params.action}`,
    method: 'POST',
    token: params.actors.admin.accessToken,
  });
}

export async function checkBlockAndUnblock(
  context: AdminTestContext,
  actors: TestActors,
): Promise<void> {
  const { environment } = context.identity;
  const { baseUrl } = context.api;
  const accountId = await findAccountId(context, { actors, email: actors.member.email });
  const before = await requestApi({ baseUrl, path: ME_PATH, token: actors.member.accessToken });
  assertCondition(before.status === 200, `o membro deveria acessar antes: ${before.status}`);

  const blocked = await postAction(context, { actors, accountId, action: 'block' });
  assertCondition(blocked.status === 200, `bloquear: ${blocked.status} ${blocked.text}`);
  assertCondition(
    readData(blocked)['isIdentityProviderSynced'] === true,
    'Keycloak não sincronizado',
  );
  assertCondition((await readBlockedAt(context, accountId)) !== null, 'blocked_at não gravado');
  assertCondition(
    !(await readKeycloakUser(environment, actors.member.keycloakId)).enabled,
    'KC habilitado',
  );
  const afterBlock = await requestApi({ baseUrl, path: ME_PATH, token: actors.member.accessToken });
  assertCondition(afterBlock.status === 403, `conta bloqueada: ${afterBlock.status}`);
  assertCondition(readErrorCode(afterBlock) === 'ACCOUNT_BLOCKED', 'código ACCOUNT_BLOCKED');
  const redirects = await attemptLoginRedirects({
    identity: context.identity,
    baseUrl,
    redirectUri: context.api.environment.SESSION_ALLOWED_REDIRECT_URIS[0] ?? '',
    user: toTestUser(actors.member),
  });
  assertCondition(!redirects, 'o Keycloak deixou a conta bloqueada entrar');
  reportAdminStep(
    'POST .../block',
    'blocked_at gravado, usuário desabilitado no Keycloak, token antigo recebe 403 ACCOUNT_BLOCKED e novo login é recusado',
  );

  const unblocked = await postAction(context, { actors, accountId, action: 'unblock' });
  assertCondition(unblocked.status === 200, `desbloquear: ${unblocked.status}`);
  assertCondition((await readBlockedAt(context, accountId)) === null, 'blocked_at não limpo');
  assertCondition(
    (await readKeycloakUser(environment, actors.member.keycloakId)).enabled,
    'KC desabilitado',
  );
  const afterUnblock = await requestApi({
    baseUrl,
    path: ME_PATH,
    token: actors.member.accessToken,
  });
  assertCondition(afterUnblock.status === 200, `depois de desbloquear: ${afterUnblock.status}`);
  reportAdminStep('POST .../unblock', 'Keycloak habilitado, banco limpo, o membro volta a acessar');
}

export async function checkBlockRefusals(
  context: AdminTestContext,
  actors: TestActors,
): Promise<void> {
  const { environment } = context.identity;
  const otherAdminId = await findAccountId(context, { actors, email: actors.otherAdmin.email });
  const adminId = await findAccountId(context, { actors, email: actors.admin.email });
  const onAdmin = await postAction(context, { actors, accountId: otherAdminId, action: 'block' });
  const onSelf = await postAction(context, { actors, accountId: adminId, action: 'block' });
  const unknown = await postAction(context, {
    actors,
    accountId: crypto.randomUUID(),
    action: 'block',
  });
  assertCondition(
    onAdmin.status === 409 && readErrorCode(onAdmin) === 'CANNOT_BLOCK_ADMIN',
    'bloquear admin',
  );
  assertCondition(
    onSelf.status === 409 && readErrorCode(onSelf) === 'CANNOT_BLOCK_SELF',
    'bloquear a si',
  );
  assertCondition(
    unknown.status === 404 && readErrorCode(unknown) === 'ACCOUNT_NOT_FOUND',
    'inexistente',
  );
  assertCondition(
    (await readBlockedAt(context, otherAdminId)) === null,
    'o admin foi bloqueado no banco',
  );
  assertCondition(
    (await readKeycloakUser(environment, actors.otherAdmin.keycloakId)).enabled,
    'o admin foi desabilitado no Keycloak',
  );
  reportAdminStep(
    'bloqueio recusado',
    'outro admin 409 CANNOT_BLOCK_ADMIN, a si mesmo 409 CANNOT_BLOCK_SELF, inexistente 404; nada mudou no banco nem no Keycloak',
  );
}
