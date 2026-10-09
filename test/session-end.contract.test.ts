// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { FAKE_KEYCLOAK_MODE } from './fixtures/fake-keycloak.fixture.js';
import {
  REFRESH_URL_PATH,
  SESSION_URL_PATH,
  callSession,
  createSessionHarness,
  signIn,
  type SessionHarness,
} from './fixtures/session-harness.fixture.js';

let harness: SessionHarness;

beforeEach(async () => {
  harness = await createSessionHarness();
});

afterEach(async () => {
  await harness.stop();
});

describe('DELETE /v1/session', () => {
  test('revokes the refresh at Keycloak, clears the cookie and answers 204', async () => {
    const refreshToken = await signIn(harness);
    const response = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'DELETE',
      cookie: refreshToken,
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(harness.keycloak.logoutCount()).toBe(1);
    const afterwards = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: refreshToken,
    });
    expect(afterwards.status).toBe(401);
  });

  test('is idempotent: without a cookie, and twice with the same one, it answers 204', async () => {
    const refreshToken = await signIn(harness);
    const statuses: number[] = [];
    for (const cookie of [undefined, refreshToken, refreshToken]) {
      const response = await callSession(harness, {
        path: SESSION_URL_PATH,
        method: 'DELETE',
        ...(cookie === undefined ? {} : { cookie }),
      });
      statuses.push(response.status);
    }
    expect(statuses).toStrictEqual([204, 204, 204]);
  });

  test('answers 503 but still clears the cookie when Keycloak cannot revoke, telling to try again', async () => {
    const refreshToken = await signIn(harness);
    harness.keycloak.setMode(FAKE_KEYCLOAK_MODE.SERVER_ERROR);
    const response = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'DELETE',
      cookie: refreshToken,
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('SESSION_UNAVAILABLE');
    expect(body.error.message).toContain('Tente novamente');
  });
});

describe('rate limit on the session routes', () => {
  test('allows 10 calls per minute per address and then answers 429', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await callSession(harness, {
        path: SESSION_URL_PATH,
        method: 'DELETE',
        socketAddress: '203.0.113.99',
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 204)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
