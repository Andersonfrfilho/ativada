// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildAdminUrl, fetchServiceAccountToken } from '../identity-test/keycloak-client.js';
import { sendRequest } from '../identity-test/http-client.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import { waitForActionEmails } from './action-email.js';
import { opensPasswordForm, setPasswordThroughLink } from './action-link-flow.js';
import { INVITEE_PREFIX } from './admin-test.constant.js';
import {
  reportAdminStep,
  reportMeasurement,
  type AdminTestContext,
  type TestActors,
} from './admin-test-context.js';
import { readData, readErrorCode } from './api-request.js';
import { invite } from './check-invitation.js';
import { findKeycloakUserByEmail } from './keycloak-reads.js';

const ACTION_LIFESPAN_SECONDS = 86_400;

export async function measureDirectResend(context: AdminTestContext): Promise<void> {
  const { environment } = context.identity;
  const token = await fetchServiceAccountToken(environment);
  const email = `${INVITEE_PREFIX}probe-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const adminUrl = buildAdminUrl(environment);
  const created = await sendRequest({
    url: `${adminUrl}/users`,
    token,
    json: { username: email, email, enabled: true, emailVerified: false },
  });
  const userId = created.headers.get('location')?.split('/').at(-1) ?? '';
  const redirect = encodeURIComponent(`${environment.panelOrigin}/auth/callback`);
  const send = (): Promise<unknown> =>
    sendRequest({
      url: `${adminUrl}/users/${userId}/execute-actions-email?lifespan=${ACTION_LIFESPAN_SECONDS}&client_id=crypto-session&redirect_uri=${redirect}`,
      method: 'PUT',
      token,
      json: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
    });
  await send();
  await Bun.sleep(1_200);
  await send();
  const mails = await waitForActionEmails(environment, { address: email, count: 2 });
  const [older, newer] = [mails[0]?.link ?? '', mails[1]?.link ?? ''];
  const oldStillWorks = await opensPasswordForm(environment, older);
  const newWorks = await opensPasswordForm(environment, newer);
  reportMeasurement(
    'reenviar execute-actions-email direto no Keycloak',
    `link anterior ainda abre o formulário de senha: ${String(oldStillWorks)}; link novo: ${String(newWorks)}`,
  );
}

export async function checkResend(
  context: AdminTestContext,
  params: { readonly actors: TestActors; readonly email: string },
): Promise<void> {
  const { environment } = context.identity;
  const { actors, email } = params;
  const firstInvitee = await findKeycloakUserByEmail(environment, email);
  const [firstMail] = await waitForActionEmails(environment, { address: email, count: 1 });
  const answer = await invite(context, { actors, email });
  assertCondition(
    answer.status === 201 && readData(answer)['isResend'] === true,
    `reenvio: ${answer.status}`,
  );
  const secondInvitee = await findKeycloakUserByEmail(environment, email);
  assertCondition(
    secondInvitee?.id !== firstInvitee?.id,
    'o convidado pendente deveria ser recriado',
  );
  const mails = await waitForActionEmails(environment, { address: email, count: 2 });
  const [oldLink, newLink] = [firstMail?.link ?? '', mails.at(-1)?.link ?? ''];
  assertCondition(
    !(await opensPasswordForm(environment, oldLink)),
    'o link anterior ainda funciona',
  );
  assertCondition(
    await opensPasswordForm(environment, newLink),
    'o link novo não abre o formulário',
  );
  reportAdminStep(
    'reenvio de convite',
    'convidado pendente recriado; link anterior invalidado; link novo válido',
  );

  assertCondition(await setPasswordThroughLink(environment, newLink), 'não concluiu o convite');
  const afterAcceptance = await invite(context, { actors, email });
  assertCondition(
    afterAcceptance.status === 409,
    `reenvio a conta ativa: ${afterAcceptance.status}`,
  );
  assertCondition(readErrorCode(afterAcceptance) === 'ACCOUNT_ALREADY_ACTIVE', 'código do 409');
  const unchanged = await findKeycloakUserByEmail(environment, email);
  assertCondition(unchanged?.id === secondInvitee?.id, 'a conta ativa foi recriada');
  const stillOpens = await opensPasswordForm(environment, newLink);
  reportMeasurement(
    'link do convite depois de a conta ficar ativa',
    `o link usado ainda abre o formulário de senha: ${String(stillOpens)} (Keycloak 26.8 não torna o link de uso único)`,
  );
  reportAdminStep(
    'reenvio a conta ativa',
    '409 ACCOUNT_ALREADY_ACTIVE; nenhum e-mail novo; conta preservada',
  );
}
