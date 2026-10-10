// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  ACCOUNT_ERROR_CODE,
  AUTHENTICATION_ERROR_CODE,
} from '../apps/api-cryptoada/src/shared/errors/error-code.constant.js';
import {
  ADMIN_PATH,
  USER_PATH,
  createApiHarness,
  type ApiHarness,
} from './fixtures/api-harness.fixture.js';
import { JWKS_SERVER_MODE } from './fixtures/jwks-test-server.fixture.js';
import { createTestSigningKey, signTestToken } from './fixtures/token-signing.fixture.js';

const DELETED_SUBJECT = 'subject-deleted';
const BLOCKED_SUBJECT = 'subject-blocked';
const SECONDS_PER_MINUTE = 60;

type ErrorBody = { readonly error: { readonly code: string; readonly message: string } };

let harness: ApiHarness;

async function readErrorBody(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

async function expectError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const body = await readErrorBody(response);
  expect(body.error.code).toBe(code);
  expect(Object.keys(body)).toStrictEqual(['error']);
  expect(JSON.stringify(body)).not.toMatch(/stack|at .*\(/);
}

beforeAll(async () => {
  harness = await createApiHarness({
    deletedSubjects: [DELETED_SUBJECT],
    blockedSubjects: [BLOCKED_SUBJECT],
  });
});

afterAll(async () => {
  await harness.stop();
});

describe('authentication on protected routes', () => {
  test('a valid token reaches the handler inside the { data } envelope', async () => {
    const response = await harness.send({
      path: USER_PATH,
      token: await signTestToken({ key: harness.key }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ data: { reached: true } });
  });

  test.each([
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic dXNlcjpwYXNz'],
    ['a Bearer without a JWT shape', 'Bearer not-a-jwt'],
  ])('%s answers 401 AUTHENTICATION_REQUIRED', async (_name, authorization) => {
    const response = await harness.send({
      path: USER_PATH,
      headers: authorization === undefined ? {} : { Authorization: authorization },
    });
    await expectError(response, 401, AUTHENTICATION_ERROR_CODE.AUTHENTICATION_REQUIRED);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  test('an expired token answers 401 ACCESS_TOKEN_EXPIRED with WWW-Authenticate', async () => {
    const token = await signTestToken({
      key: harness.key,
      issuedSecondsAgo: 10 * SECONDS_PER_MINUTE,
      lifetimeSeconds: 5 * SECONDS_PER_MINUTE,
    });
    const response = await harness.send({ path: USER_PATH, token });
    await expectError(response, 401, AUTHENTICATION_ERROR_CODE.ACCESS_TOKEN_EXPIRED);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer error="invalid_token"');
  });

  test('a signature from another key answers 401 INVALID_ACCESS_TOKEN', async () => {
    const strangerKey = await createTestSigningKey('key-1');
    const response = await harness.send({
      path: USER_PATH,
      token: await signTestToken({ key: strangerKey }),
    });
    await expectError(response, 401, AUTHENTICATION_ERROR_CODE.INVALID_ACCESS_TOKEN);
  });

  test.each([
    ['iss', { iss: 'http://other.test' }],
    ['aud', { aud: 'other-api' }],
    ['azp', { azp: 'crypto-panel' }],
  ])('a wrong %s answers 401 INVALID_ACCESS_TOKEN', async (_name, claims) => {
    const response = await harness.send({
      path: USER_PATH,
      token: await signTestToken({ key: harness.key, claims }),
    });
    await expectError(response, 401, AUTHENTICATION_ERROR_CODE.INVALID_ACCESS_TOKEN);
  });

  test('an unverified e-mail answers 403 EMAIL_NOT_VERIFIED', async () => {
    const token = await signTestToken({ key: harness.key, claims: { email_verified: false } });
    await expectError(
      await harness.send({ path: USER_PATH, token }),
      403,
      AUTHENTICATION_ERROR_CODE.EMAIL_NOT_VERIFIED,
    );
  });

  test.each([
    ['no roles at all', { realm_access: undefined }],
    ['only unrelated roles', { realm_access: { roles: ['offline_access'] } }],
  ])('a token with %s answers 403 FORBIDDEN', async (_name, claims) => {
    const token = await signTestToken({ key: harness.key, claims });
    await expectError(
      await harness.send({ path: USER_PATH, token }),
      403,
      AUTHENTICATION_ERROR_CODE.FORBIDDEN,
    );
  });

  test('a deleted account answers 401 ACCOUNT_DELETED', async () => {
    const token = await signTestToken({ key: harness.key, claims: { sub: DELETED_SUBJECT } });
    await expectError(
      await harness.send({ path: USER_PATH, token }),
      401,
      ACCOUNT_ERROR_CODE.ACCOUNT_DELETED,
    );
  });

  test('a blocked account answers 403 ACCOUNT_BLOCKED', async () => {
    const token = await signTestToken({ key: harness.key, claims: { sub: BLOCKED_SUBJECT } });
    await expectError(
      await harness.send({ path: USER_PATH, token }),
      403,
      ACCOUNT_ERROR_CODE.ACCOUNT_BLOCKED,
    );
  });
});

describe('admin routes require the admin role and acr >= 2', () => {
  const adminRoles = { realm_access: { roles: ['user', 'admin'] } };

  test('admin with acr password answers 403 MFA_REQUIRED', async () => {
    const token = await signTestToken({
      key: harness.key,
      claims: { ...adminRoles, acr: 'password' },
    });
    await expectError(
      await harness.send({ path: ADMIN_PATH, token }),
      403,
      AUTHENTICATION_ERROR_CODE.MFA_REQUIRED,
    );
  });

  test.each(['2', 'mfa'])('admin with acr %s reaches the handler', async (acr) => {
    const token = await signTestToken({ key: harness.key, claims: { ...adminRoles, acr } });
    expect((await harness.send({ path: ADMIN_PATH, token })).status).toBe(200);
  });

  test('a plain user with acr 2 answers 403 FORBIDDEN, not MFA_REQUIRED', async () => {
    const token = await signTestToken({ key: harness.key, claims: { acr: '2' } });
    await expectError(
      await harness.send({ path: ADMIN_PATH, token }),
      403,
      AUTHENTICATION_ERROR_CODE.FORBIDDEN,
    );
  });

  test('an admin-only account cannot use user routes', async () => {
    const token = await signTestToken({
      key: harness.key,
      claims: { realm_access: { roles: ['admin'] }, acr: '2' },
    });
    await expectError(
      await harness.send({ path: USER_PATH, token }),
      403,
      AUTHENTICATION_ERROR_CODE.FORBIDDEN,
    );
  });
});

describe('infrastructure failures are never an authentication success', () => {
  test.each([JWKS_SERVER_MODE.DOWN, JWKS_SERVER_MODE.SLOW, JWKS_SERVER_MODE.GARBAGE])(
    'JWKS in mode %s answers 503 AUTHENTICATION_UNAVAILABLE',
    async (mode) => {
      const brokenHarness = await createApiHarness();
      brokenHarness.jwks.setMode(mode);
      try {
        const token = await signTestToken({ key: brokenHarness.key });
        const response = await brokenHarness.send({ path: USER_PATH, token });
        expect(response.status).not.toBe(200);
        await expectError(response, 503, AUTHENTICATION_ERROR_CODE.AUTHENTICATION_UNAVAILABLE);
        expect(brokenHarness.resolvedSubjects).toStrictEqual([]);
      } finally {
        await brokenHarness.stop();
      }
    },
  );

  test('an unknown error from the key resolver answers 503, never 2xx', async () => {
    const failingHarness = await createApiHarness({
      getKeyOverride: () => Promise.reject(new Error('unexpected')),
    });
    try {
      const token = await signTestToken({ key: failingHarness.key });
      const response = await failingHarness.send({ path: USER_PATH, token });
      await expectError(response, 503, AUTHENTICATION_ERROR_CODE.AUTHENTICATION_UNAVAILABLE);
      expect(failingHarness.reportedErrors).toHaveLength(0);
    } finally {
      await failingHarness.stop();
    }
  });
});
