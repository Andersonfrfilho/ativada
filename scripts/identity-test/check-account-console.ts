// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createPkcePair,
  readAuthorizationCode,
  startLogin,
  submitLoginForm,
  type LoginStep,
} from './browser-login.js';
import type { IdentityContext } from './identity-context.js';
import { reportStep } from './identity-context.js';
import { buildRealmUrl, requestTokenGrant } from './keycloak-client.js';
import { isJsonRecord, parseJsonRecord, readString, sendRequest } from './http-client.js';
import { assertCondition, IdentityTestError } from './identity-test.error.js';
import { createTestUser, TEST_USER_PASSWORD } from './test-users.js';

const ACCOUNT_CLIENT_ID = 'account-console';
const JSON_ACCEPT = 'application/json';

type PasswordOnlyLogin = {
  readonly token: string;
  readonly step: LoginStep;
};

async function loginWithPasswordOnly(
  context: IdentityContext,
  username: string,
  keycloakAction?: string,
): Promise<PasswordOnlyLogin> {
  const { environment } = context;
  const redirectUri = `${buildRealmUrl(environment)}/account/`;
  const pkce = createPkcePair();
  const first = await startLogin({
    environment,
    pkce,
    clientId: ACCOUNT_CLIENT_ID,
    redirectUri,
    ...(keycloakAction === undefined ? {} : { keycloakAction }),
  });
  if (first.kind !== 'page') throw new IdentityTestError('account-console não abriu o login');
  const step = await submitLoginForm(
    first,
    { username, password: TEST_USER_PASSWORD, credentialId: '' },
    redirectUri,
  );
  if (step.kind !== 'redirect') return { token: '', step };
  const grant = await requestTokenGrant(environment, {
    grant_type: 'authorization_code',
    client_id: ACCOUNT_CLIENT_ID,
    code: readAuthorizationCode(step.location),
    redirect_uri: redirectUri,
    code_verifier: pkce.verifier,
  });
  return { token: readString(parseJsonRecord(grant), 'access_token'), step };
}

async function findOtpCredentialId(accountUrl: string, token: string): Promise<string> {
  const listed = await sendRequest({
    url: `${accountUrl}/credentials`,
    token,
    accept: JSON_ACCEPT,
  });
  const types = JSON.parse(listed.text) as unknown;
  const otpType = Array.isArray(types)
    ? (types as readonly unknown[]).find(
        (entry: unknown) => isJsonRecord(entry) && entry['type'] === 'otp',
      )
    : undefined;
  const metadata = isJsonRecord(otpType) ? otpType['userCredentialMetadatas'] : undefined;
  const first: unknown = Array.isArray(metadata) ? metadata[0] : undefined;
  const credential = isJsonRecord(first) ? first['credential'] : undefined;
  return isJsonRecord(credential) && typeof credential['id'] === 'string' ? credential['id'] : '';
}

export async function checkAccountConsoleStepUp(context: IdentityContext): Promise<void> {
  const user = await createTestUser({
    environment: context.environment,
    cleanup: context.cleanup,
    kind: 'admin-with-otp',
  });
  const accountUrl = `${buildRealmUrl(context.environment)}/account`;
  const { token } = await loginWithPasswordOnly(context, user.username);
  const removal = await sendRequest({
    url: `${accountUrl}/credentials/${await findOtpCredentialId(accountUrl, token)}`,
    method: 'DELETE',
    token,
    accept: JSON_ACCEPT,
  });
  console.log(`identity-test: MEDICAO M6 remover TOTP só com senha -> HTTP ${removal.status}`);
  assertCondition(removal.status === 403, `remover o TOTP deu ${removal.status}`);
  const addDevice = await loginWithPasswordOnly(context, user.username, 'CONFIGURE_TOTP');
  const addHtml = addDevice.step.kind === 'page' ? addDevice.step.html : '';
  console.log(
    `identity-test: MEDICAO M6 kc_action=CONFIGURE_TOTP só com senha -> pede OTP ${String(addHtml.includes('name="otp"'))}, abre cadastro de novo aparelho ${String(addHtml.includes('name="totp"'))}`,
  );
  assertCondition(addHtml.includes('name="otp"'), 'cadastrar outro aparelho não pediu o OTP');
  const password = await loginWithPasswordOnly(context, user.username, 'UPDATE_PASSWORD');
  const passwordHtml = password.step.kind === 'page' ? password.step.html : '';
  console.log(
    `identity-test: MEDICAO M6 kc_action=UPDATE_PASSWORD só com senha -> abre a troca de senha ${String(passwordHtml.includes('password-new'))}`,
  );
  reportStep(
    'console da conta',
    'LoA 1 não remove o TOTP (403) nem cadastra outro aparelho sem o OTP; a troca de senha segue permitida',
  );
}
