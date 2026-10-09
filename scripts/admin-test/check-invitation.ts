// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import { waitForActionEmails } from './action-email.js';
import {
  EXPECTED_ACTIONS,
  EXPECTED_LIFESPAN_SECONDS,
  INVITATIONS_PATH,
  INVITEE_PREFIX,
} from './admin-test.constant.js';
import { reportAdminStep, type AdminTestContext, type TestActors } from './admin-test-context.js';
import { readData, readErrorCode, requestApi, type ApiAnswer } from './api-request.js';
import { findKeycloakUserByEmail, readRealmRoleNames } from './keycloak-reads.js';

type CountRow = { readonly total: number };

export function buildInviteeEmail(): string {
  return `${INVITEE_PREFIX}${crypto.randomUUID().slice(0, 8)}@example.test`;
}

export function invite(
  context: AdminTestContext,
  params: { readonly actors: TestActors; readonly email: string },
): Promise<ApiAnswer> {
  return requestApi({
    baseUrl: context.api.baseUrl,
    path: INVITATIONS_PATH,
    method: 'POST',
    token: params.actors.admin.accessToken,
    body: { email: params.email },
  });
}

async function countAccountsOfSubject(context: AdminTestContext, subject: string): Promise<number> {
  const rows: unknown =
    await context.sql`SELECT count(*)::int AS total FROM users WHERE keycloak_sub = ${subject}`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

export async function checkFirstInvitation(
  context: AdminTestContext,
  actors: TestActors,
): Promise<string> {
  const email = buildInviteeEmail();
  const answer = await invite(context, { actors, email });
  assertCondition(answer.status === 201, `convite: ${answer.status} ${answer.text}`);
  assertCondition(readData(answer)['isResend'] === false, 'primeiro convite não é reenvio');
  const [mail] = await waitForActionEmails(context.identity.environment, {
    address: email,
    count: 1,
  });
  assertCondition(
    mail?.lifespanSeconds === EXPECTED_LIFESPAN_SECONDS,
    `validade ${mail?.lifespanSeconds}`,
  );
  assertCondition(mail.actions.join() === EXPECTED_ACTIONS.join(), `ações ${mail.actions.join()}`);
  const invitee = await findKeycloakUserByEmail(context.identity.environment, email);
  assertCondition(
    invitee !== undefined && !invitee.emailVerified,
    'convidado criado sem e-mail verificado',
  );
  const roles = await readRealmRoleNames(context.identity.environment, invitee.id);
  assertCondition(!roles.includes('admin'), `o convidado nasceu com admin: ${roles.join()}`);
  assertCondition(
    (await countAccountsOfSubject(context, invitee.id)) === 0,
    'conta criada antes do login',
  );
  assertCondition(!answer.text.includes('@'), 'o e-mail apareceu na resposta');
  reportAdminStep(
    'POST /v1/admin/invitations',
    `e-mail real no Mailpit; validade ${mail.lifespanSeconds}s; ações ${mail.actions.join('+')}; papéis [${roles.join(',')}]`,
  );
  return email;
}

export async function checkInvitationRefusals(
  context: AdminTestContext,
  actors: TestActors,
): Promise<void> {
  const { baseUrl } = context.api;
  const asMember = await requestApi({
    baseUrl,
    path: INVITATIONS_PATH,
    method: 'POST',
    token: actors.member.accessToken,
    body: { email: buildInviteeEmail() },
  });
  const withRole = await requestApi({
    baseUrl,
    path: INVITATIONS_PATH,
    method: 'POST',
    token: actors.admin.accessToken,
    body: { email: buildInviteeEmail(), role: 'admin' },
  });
  assertCondition(asMember.status === 403, `membro convidando: ${asMember.status}`);
  assertCondition(withRole.status === 400, `convite com role: ${withRole.status}`);
  assertCondition(readErrorCode(withRole) === 'REQUEST_VALIDATION_FAILED', 'código do 400');
  reportAdminStep('convite recusado', 'membro 403; corpo com role 400 (convite nunca cria admin)');
}
