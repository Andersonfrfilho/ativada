// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { FAKE_KEYCLOAK_MODE } from './fixtures/fake-keycloak.fixture.js';
import {
  ALLOWED_REDIRECT_URI,
  COOKIE_NAME,
  SESSION_URL_PATH,
  buildValidExchangeBody,
  callSession,
  createSessionHarness,
  readCookieValue,
  signIn,
  type SessionHarness,
} from './fixtures/session-harness.fixture.js';

type TokenBody = { data: { accessToken: string; expiresIn: number } };
type ErrorBody = { error: { code: string; message: string } };

let harness: SessionHarness;

beforeEach(async () => {
  harness = await createSessionHarness();
});

afterEach(async () => {
  await harness.stop();
});

describe('POST /v1/session', () => {
  test('exchanges the code and keeps the refresh token only in the cookie', async () => {
    const response = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'POST',
      body: buildValidExchangeBody(),
    });
    const text = await response.text();
    const body = JSON.parse(text) as TokenBody;
    const cookie = response.headers.get('Set-Cookie') ?? '';
    const refreshToken = readCookieValue(response);
    expect(response.status).toBe(200);
    expect(Object.keys(body.data).sort()).toStrictEqual(['accessToken', 'expiresIn']);
    expect(body.data.expiresIn).toBe(300);
    expect(refreshToken.length).toBeGreaterThan(10);
    expect(text).not.toContain(refreshToken);
    expect(text).not.toContain('refresh');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(cookie.startsWith(`${COOKIE_NAME}=`)).toBe(true);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=1800']) {
      expect(cookie.split('; ')).toContain(attribute);
    }
    expect(cookie).not.toContain('Domain');
  });

  test('sends the confidential client credentials and the PKCE verifier to Keycloak', async () => {
    await signIn(harness);
    const [request] = harness.keycloak.requests();
    expect(request?.form['client_id']).toBe('ativada-session');
    expect(request?.form['client_secret']).toBeDefined();
    expect(request?.form['redirect_uri']).toBe(ALLOWED_REDIRECT_URI);
    expect(request?.form['code_verifier']).toBeDefined();
  });

  test('refuses a redirectUri outside the configured list without calling Keycloak', async () => {
    const response = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'POST',
      body: { ...buildValidExchangeBody(), redirectUri: `${ALLOWED_REDIRECT_URI}/../other` },
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error.code).toBe('REDIRECT_URI_NOT_ALLOWED');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(harness.keycloak.requests()).toHaveLength(0);
  });

  test.each([
    ['missing field', { code: 'x' }],
    ['unknown field', { ...buildValidExchangeBody(), userId: 'other' }],
    ['short verifier', { ...buildValidExchangeBody(), codeVerifier: 'short' }],
    ['not an object', 'text'],
  ])('answers 400 for a malformed body (%s)', async (_label, body) => {
    const response = await callSession(harness, { path: SESSION_URL_PATH, method: 'POST', body });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error.code).toBe('INVALID_SESSION_REQUEST');
    expect(harness.keycloak.requests()).toHaveLength(0);
  });

  test('answers 400 when Keycloak rejects the code and sets no cookie', async () => {
    const response = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'POST',
      body: { ...buildValidExchangeBody(), code: 'a-code-keycloak-does-not-know' },
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).error.code).toBe('AUTHORIZATION_CODE_REJECTED');
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  test('never turns a token the API itself would refuse into a session', async () => {
    harness.setAccessTokenClaims({ aud: 'another-audience' });
    const response = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'POST',
      body: buildValidExchangeBody(),
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).error.code).toBe('INVALID_ACCESS_TOKEN');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(harness.keycloak.logoutCount()).toBe(1);
  });

  test('refuses a token whose e-mail is not verified', async () => {
    harness.setAccessTokenClaims({ email_verified: false });
    const response = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'POST',
      body: buildValidExchangeBody(),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  test('answers 503 when Keycloak is failing', async () => {
    harness.keycloak.setMode(FAKE_KEYCLOAK_MODE.SERVER_ERROR);
    const response = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'POST',
      body: buildValidExchangeBody(),
    });
    expect(response.status).toBe(503);
    expect(((await response.json()) as ErrorBody).error.code).toBe('SESSION_UNAVAILABLE');
  });
});
