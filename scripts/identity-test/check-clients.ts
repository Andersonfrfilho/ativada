// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildAuthorizationUrl, createPkcePair } from './browser-login.js';
import type { IdentityContext } from './identity-context.js';
import { reportStep } from './identity-context.js';
import { requestTokenGrant, SESSION_CLIENT_ID } from './keycloak-client.js';
import { parseJsonRecord, readText, sendRequest } from './http-client.js';
import { assertCondition } from './identity-test.error.js';

async function readTokenError(
  context: IdentityContext,
  form: Readonly<Record<string, string>>,
): Promise<{ readonly status: number; readonly error: string }> {
  const result = await requestTokenGrant(context.environment, form);
  const body = parseJsonRecord(result);
  return { status: result.status, error: readText(body, 'error') };
}

async function isAuthorizationRefused(context: IdentityContext, url: string): Promise<boolean> {
  const result = await sendRequest({ url });
  const location = result.headers.get('location') ?? '';
  return result.status >= 400 || location.includes('error=');
}

export async function checkClientFlows(context: IdentityContext): Promise<void> {
  const { environment } = context;
  const passwordGrant = await readTokenError(context, {
    grant_type: 'password',
    client_id: SESSION_CLIENT_ID,
    username: 'nobody',
    password: 'nothing',
  });
  assertCondition(
    passwordGrant.error === 'unauthorized_client',
    `direct grant em cryptoada-session: ${passwordGrant.error}`,
  );

  const adminCliGrant = await readTokenError(context, {
    grant_type: 'password',
    client_id: 'admin-cli',
    username: 'nobody',
    password: 'nothing',
  });
  assertCondition(
    adminCliGrant.error === 'unauthorized_client',
    `direct grant em admin-cli do realm: ${adminCliGrant.error}`,
  );

  const sessionCredentials = await readTokenError(context, {
    grant_type: 'client_credentials',
    client_id: SESSION_CLIENT_ID,
    client_secret: environment.sessionClientSecret,
  });
  assertCondition(
    sessionCredentials.error === 'unauthorized_client',
    `client_credentials em cryptoada-session: ${sessionCredentials.error}`,
  );

  const implicitRefused = await isAuthorizationRefused(
    context,
    buildAuthorizationUrl(environment, { response_type: 'token' }),
  );
  assertCondition(implicitRefused, 'cryptoada-session aceitou o fluxo implícito');

  const withoutPkce = await isAuthorizationRefused(context, buildAuthorizationUrl(environment, {}));
  assertCondition(withoutPkce, 'cryptoada-session aceitou Code sem PKCE');

  const plainPkce = await isAuthorizationRefused(
    context,
    buildAuthorizationUrl(environment, {
      code_challenge: 'x'.repeat(43),
      code_challenge_method: 'plain',
    }),
  );
  assertCondition(plainPkce, 'cryptoada-session aceitou PKCE plain');

  const withPkce = createPkcePair();
  const accepted = await sendRequest({
    url: buildAuthorizationUrl(environment, {
      code_challenge: withPkce.challenge,
      code_challenge_method: 'S256',
    }),
  });
  assertCondition(
    accepted.status === 200 && accepted.text.includes('<form'),
    'Code + PKCE S256 não abriu o login',
  );
  reportStep(
    'clientes',
    'direct grant (cryptoada-session e admin-cli), implicit, Code sem PKCE e PKCE plain recusados; Code + S256 abre o login',
  );
}
