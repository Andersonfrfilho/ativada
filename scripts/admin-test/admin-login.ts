// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createPkcePair,
  readAuthorizationCode,
  startLogin,
  submitLoginForm,
  type LoginStep,
} from '../identity-test/browser-login.js';
import type { IdentityContext } from '../identity-test/identity-context.js';
import { IdentityTestError } from '../identity-test/identity-test.error.js';
import { generateTotpCode, millisecondsUntilNextPeriod } from '../identity-test/totp.js';
import { TEST_OTP_SECRET, TEST_USER_PASSWORD, type TestUser } from '../identity-test/test-users.js';
import { requestApi, readData } from './api-request.js';
import {
  OTP_SAFE_WINDOW_MILLISECONDS,
  SESSION_CLIENT_ID,
  SESSION_PATH,
} from './admin-test.constant.js';

type PageStep = Extract<LoginStep, { kind: 'page' }>;

export type LoginParams = {
  readonly identity: IdentityContext;
  readonly baseUrl: string;
  readonly redirectUri: string;
  readonly user: TestUser;
  readonly acrValues?: string;
};

function expectPage(step: LoginStep, description: string): PageStep {
  if (step.kind !== 'page') throw new IdentityTestError(`${description}: veio redirect`);
  return step;
}

async function submitOtp(page: PageStep): Promise<LoginStep> {
  const remaining = millisecondsUntilNextPeriod(Date.now());
  if (remaining < OTP_SAFE_WINDOW_MILLISECONDS) await Bun.sleep(remaining + 500);
  return submitLoginForm(page, {
    otp: generateTotpCode(TEST_OTP_SECRET, Date.now()),
    login: 'Sign In',
  });
}

export async function loginThroughApi(params: LoginParams): Promise<string> {
  const pkce = createPkcePair();
  const first = expectPage(
    await startLogin({
      environment: params.identity.environment,
      pkce,
      clientId: SESSION_CLIENT_ID,
      ...(params.acrValues === undefined ? {} : { acrValues: params.acrValues }),
    }),
    'abertura do login',
  );
  let outcome = await submitLoginForm(first, {
    username: params.user.username,
    password: TEST_USER_PASSWORD,
    credentialId: '',
  });
  if (params.acrValues !== undefined) outcome = await submitOtp(expectPage(outcome, 'OTP'));
  if (outcome.kind !== 'redirect') throw new IdentityTestError('o login não terminou em redirect');
  const answer = await requestApi({
    baseUrl: params.baseUrl,
    path: SESSION_PATH,
    method: 'POST',
    origin: params.identity.environment.panelOrigin,
    body: {
      code: readAuthorizationCode(outcome.location),
      codeVerifier: pkce.verifier,
      redirectUri: params.redirectUri,
    },
  });
  const accessToken = readData(answer)['accessToken'];
  if (typeof accessToken !== 'string') {
    throw new IdentityTestError(`POST /v1/session não devolveu token: ${answer.status}`);
  }
  return accessToken;
}

export async function attemptLoginRedirects(params: LoginParams): Promise<boolean> {
  const first = expectPage(
    await startLogin({
      environment: params.identity.environment,
      pkce: createPkcePair(),
      clientId: SESSION_CLIENT_ID,
    }),
    'abertura do login',
  );
  const outcome = await submitLoginForm(first, {
    username: params.user.username,
    password: TEST_USER_PASSWORD,
    credentialId: '',
  });
  return outcome.kind === 'redirect';
}
