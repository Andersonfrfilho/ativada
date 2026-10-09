// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { FAKE_KEYCLOAK_MODE } from './fixtures/fake-keycloak.fixture.js';
import {
  COOKIE_NAME,
  REFRESH_URL_PATH,
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

describe('POST /v1/session/refresh', () => {
  test('renews the access token and rotates the cookie', async () => {
    const refreshToken = await signIn(harness);
    const response = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: refreshToken,
    });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((JSON.parse(text) as TokenBody).data.accessToken.split('.')).toHaveLength(3);
    expect(readCookieValue(response)).not.toBe(refreshToken);
    expect(text).not.toContain(readCookieValue(response));
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
  });

  test('two concurrent calls with the same refresh make one exchange and share the pair', async () => {
    const refreshToken = await signIn(harness);
    harness.keycloak.setMode(FAKE_KEYCLOAK_MODE.SLOW);
    const call = (): Promise<Response> =>
      callSession(harness, { path: REFRESH_URL_PATH, method: 'POST', cookie: refreshToken });
    const [first, second] = await Promise.all([call(), call()]);
    const third = await call();
    expect([first.status, second.status, third.status]).toStrictEqual([200, 200, 200]);
    expect(harness.keycloak.countRequests('refresh_token')).toBe(1);
    expect(readCookieValue(second)).toBe(readCookieValue(first));
    expect(readCookieValue(third)).toBe(readCookieValue(first));
    const bodies = await Promise.all([first, second].map((r) => r.json() as Promise<TokenBody>));
    expect(bodies[1]?.data.accessToken).toBe(bodies[0]?.data.accessToken);
  });

  test('the rotated refresh from the cookie renews again', async () => {
    const first = await signIn(harness);
    const renewed = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: first,
    });
    const next = readCookieValue(renewed);
    const again = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: next,
    });
    expect(again.status).toBe(200);
    expect(harness.keycloak.countRequests('refresh_token')).toBe(2);
  });

  test('answers 401 SESSION_ENDED and clears the cookie when Keycloak answers 400', async () => {
    const refreshToken = await signIn(harness);
    harness.keycloak.setMode(FAKE_KEYCLOAK_MODE.INVALID_GRANT);
    const response = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: refreshToken,
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as ErrorBody).error.code).toBe('SESSION_ENDED');
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie.startsWith(`${COOKIE_NAME}=;`)).toBe(true);
    expect(cookie).toContain('Max-Age=0');
  });

  test('answers 503 and keeps the cookie when Keycloak fails with 5xx', async () => {
    const refreshToken = await signIn(harness);
    harness.keycloak.setMode(FAKE_KEYCLOAK_MODE.SERVER_ERROR);
    const response = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: refreshToken,
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  test('a failed attempt is not deduplicated: the retry reaches Keycloak again', async () => {
    const refreshToken = await signIn(harness);
    harness.keycloak.setMode(FAKE_KEYCLOAK_MODE.SERVER_ERROR);
    await callSession(harness, { path: REFRESH_URL_PATH, method: 'POST', cookie: refreshToken });
    harness.keycloak.setMode(FAKE_KEYCLOAK_MODE.OK);
    const retry = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: refreshToken,
    });
    expect(retry.status).toBe(200);
  });

  test.each([
    ['without a cookie', undefined],
    ['with a malformed cookie value', 'not a valid; value'],
  ])('answers 401 SESSION_ENDED %s', async (_label, cookie) => {
    const response = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      ...(cookie === undefined ? {} : { cookie }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(harness.keycloak.requests()).toHaveLength(0);
  });
});

describe('refresh when the access token cannot be verified', () => {
  test('answers 503 but stores the rotated refresh, so the next attempt still works', async () => {
    const refreshToken = await signIn(harness);
    harness.setKeyResolverFailing(true);
    const unavailable = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: refreshToken,
    });
    expect(unavailable.status).toBe(503);
    const rotated = readCookieValue(unavailable);
    expect(rotated.length).toBeGreaterThan(10);
    expect(rotated).not.toBe(refreshToken);
    harness.setKeyResolverFailing(false);
    const retry = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: rotated,
    });
    expect(retry.status).toBe(200);
  });
});
