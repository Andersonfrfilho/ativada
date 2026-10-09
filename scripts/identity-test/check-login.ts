// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  buildPanelRedirectUri,
  createPkcePair,
  readAuthorizationCode,
  startLogin,
  submitLoginForm,
  type LoginStep,
  type PkcePair,
} from './browser-login.js';
import type { IdentityContext } from './identity-context.js';
import { reportStep } from './identity-context.js';
import { decodeTokenPayload, PANEL_CLIENT_ID, requestTokenGrant } from './keycloak-client.js';
import { parseJsonRecord, readString, type JsonRecord } from './http-client.js';
import { assertCondition, IdentityTestError } from './identity-test.error.js';
import { generateTotpCode, millisecondsUntilNextPeriod } from './totp.js';
import {
  createTestUser,
  TEST_OTP_SECRET,
  TEST_USER_PASSWORD,
  type TestUser,
} from './test-users.js';

const OTP_FIELD_MARKER = 'name="otp"';
const TOTP_SETUP_MARKER = 'name="totp"';
const OTP_SAFE_WINDOW_MILLISECONDS = 3_000;

type PageStep = Extract<LoginStep, { kind: 'page' }>;
type LoginParams = {
  readonly context: IdentityContext;
  readonly user: TestUser;
  readonly acrValues?: string;
};

function expectPage(step: LoginStep, description: string): PageStep {
  if (step.kind !== 'page')
    throw new IdentityTestError(`${description}: veio redirect ${step.location}`);
  return step;
}

async function submitPassword(params: LoginParams, pkce: PkcePair): Promise<LoginStep> {
  const first = expectPage(
    await startLogin({
      environment: params.context.environment,
      pkce,
      ...(params.acrValues === undefined ? {} : { acrValues: params.acrValues }),
    }),
    'abertura do login',
  );
  return submitLoginForm(first, {
    username: params.user.username,
    password: TEST_USER_PASSWORD,
    credentialId: '',
  });
}

async function submitOtp(page: PageStep): Promise<LoginStep> {
  const remaining = millisecondsUntilNextPeriod(Date.now());
  if (remaining < OTP_SAFE_WINDOW_MILLISECONDS) await Bun.sleep(remaining + 500);
  return submitLoginForm(page, {
    otp: generateTotpCode(TEST_OTP_SECRET, Date.now()),
    login: 'Sign In',
  });
}

async function exchangeCode(
  context: IdentityContext,
  location: string,
  pkce: PkcePair,
): Promise<JsonRecord> {
  const result = await requestTokenGrant(context.environment, {
    grant_type: 'authorization_code',
    client_id: PANEL_CLIENT_ID,
    code: readAuthorizationCode(location),
    redirect_uri: buildPanelRedirectUri(context.environment),
    code_verifier: pkce.verifier,
  });
  assertCondition(result.status === 200, `troca do código: ${result.status} ${result.text}`);
  return decodeTokenPayload(readString(parseJsonRecord(result), 'access_token'));
}

function readRealmRoles(claims: JsonRecord): readonly string[] {
  const access = claims['realm_access'];
  const roles =
    typeof access === 'object' && access !== null ? (access as JsonRecord)['roles'] : undefined;
  return Array.isArray(roles) ? roles.map(String) : [];
}

export async function checkPlainUserLogin(context: IdentityContext): Promise<void> {
  const user = await createTestUser({
    environment: context.environment,
    cleanup: context.cleanup,
    kind: 'user',
  });
  const pkce = createPkcePair();
  const outcome = await submitPassword({ context, user }, pkce);
  assertCondition(outcome.kind === 'redirect', 'usuário comum não deveria receber OTP');
  const claims = await exchangeCode(context, outcome.location, pkce);
  const roles = readRealmRoles(claims);
  assertCondition(claims['azp'] === PANEL_CLIENT_ID, `azp: ${String(claims['azp'])}`);
  assertCondition(String(claims['aud']).includes('crypto-api'), `aud: ${String(claims['aud'])}`);
  assertCondition(roles.includes('user') && !roles.includes('admin'), `papéis: ${roles.join(',')}`);
  assertCondition(!roles.includes('offline_access'), 'token com offline_access');
  assertCondition(
    String(claims['acr']) === 'password',
    `acr esperado password (LoA 1), veio ${String(claims['acr'])}`,
  );
  reportStep(
    'login do usuário comum',
    `Code + PKCE sem OTP; aud crypto-api; papéis ${roles.join(',')}; acr ${String(claims['acr'])} (LoA 1 vem como o nome mapeado; LoA 2 repete o valor pedido)`,
  );
}

export async function checkAdminWithoutOtp(context: IdentityContext): Promise<void> {
  const user = await createTestUser({
    environment: context.environment,
    cleanup: context.cleanup,
    kind: 'admin-without-otp',
  });
  const outcome = await submitPassword({ context, user }, createPkcePair());
  const page = expectPage(outcome, 'admin sem OTP');
  assertCondition(
    page.html.includes(TOTP_SETUP_MARKER),
    'admin sem OTP não foi levado a configurar o TOTP',
  );
  reportStep(
    'admin sem credencial',
    'o login para na configuração obrigatória do TOTP (CONFIGURE_TOTP)',
  );
}

export async function checkAdminStepUp(context: IdentityContext): Promise<void> {
  const user = await createTestUser({
    environment: context.environment,
    cleanup: context.cleanup,
    kind: 'admin-with-otp',
  });
  const plainPkce = createPkcePair();
  const plainOutcome = await submitPassword({ context, user }, plainPkce);
  assertCondition(plainOutcome.kind === 'redirect', 'login sem acr_values pediu OTP');
  const plainClaims = await exchangeCode(context, plainOutcome.location, plainPkce);
  assertCondition(
    String(plainClaims['acr']) === 'password',
    `sem acr_values o acr deveria ser password, veio ${String(plainClaims['acr'])}`,
  );
  reportStep(
    'admin sem acr_values',
    'entra com acr password e sem OTP: o gate é acr mfa na API (step-up)',
  );
  const pkce = createPkcePair();
  const otpPage = expectPage(
    await submitPassword({ context, user, acrValues: '2' }, pkce),
    'step-up do admin',
  );
  assertCondition(otpPage.html.includes(OTP_FIELD_MARKER), 'acr_values=2 não pediu OTP');
  const outcome = await submitOtp(otpPage);
  if (outcome.kind === 'page') {
    reportStep(
      'admin com acr_values=2',
      'OBSERVADO: um segundo formulário foi pedido após o OTP (pedido duplo)',
    );
    throw new IdentityTestError('pedido duplo de OTP com acr_values=2');
  }
  const claims = await exchangeCode(context, outcome.location, pkce);
  reportStep(
    'admin com acr_values=2',
    `um único OTP; acr ${String(claims['acr'])} (LoA 1 vem como o nome mapeado; LoA 2 repete o valor pedido)`,
  );
  assertCondition(
    String(claims['acr']) === '2',
    `acr esperado 2 (LoA 2 pedido como acr_values=2), veio ${String(claims['acr'])}`,
  );
}
