// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { FOREIGN_ORIGIN } from './fixtures/api-harness.fixture.js';
import { FAKE_CODE_VERIFIER, FAKE_VALID_CODE } from './fixtures/fake-keycloak.fixture.js';
import {
  REFRESH_URL_PATH,
  SESSION_URL_PATH,
  buildValidExchangeBody,
  callSession,
  createSessionHarness,
  readCookieValue,
  signIn,
  type SessionHarness,
} from './fixtures/session-harness.fixture.js';

const SESSION_ROUTES: readonly (readonly [string, string])[] = [
  ['POST', SESSION_URL_PATH],
  ['POST', REFRESH_URL_PATH],
  ['DELETE', SESSION_URL_PATH],
];

let harness: SessionHarness;

beforeEach(async () => {
  harness = await createSessionHarness();
});

afterEach(async () => {
  await harness.stop();
});

describe('CSRF protection on the session routes', () => {
  const attacks: readonly (readonly [string, { omitHeaders?: string[]; origin?: string }])[] = [
    ['without Origin', { omitHeaders: ['Origin'] }],
    ['with a foreign Origin', { origin: FOREIGN_ORIGIN }],
    ['without X-Requested-With', { omitHeaders: ['X-Requested-With'] }],
  ];

  describe.each(SESSION_ROUTES)('%s %s', (method, path) => {
    test.each(attacks)(
      'answers 403 CSRF_REJECTED %s and never reaches Keycloak',
      async (_label, attack) => {
        const refreshToken = await signIn(harness);
        const callsBefore = harness.keycloak.requests().length;
        const response = await callSession(harness, {
          path,
          method,
          cookie: refreshToken,
          body: buildValidExchangeBody(),
          ...attack,
        });
        expect(response.status).toBe(403);
        const body = (await response.json()) as { error: { code: string } };
        expect(body.error.code).toBe('CSRF_REJECTED');
        expect(response.headers.get('Set-Cookie')).toBeNull();
        expect(harness.keycloak.requests()).toHaveLength(callsBefore);
      },
    );
  });

  test('a wrong X-Requested-With value is refused too', async () => {
    const response = await harness.api.sendThroughHandler({
      path: SESSION_URL_PATH,
      method: 'DELETE',
      headers: { Origin: 'http://panel.test', 'X-Requested-With': 'XMLHttpRequest' },
    });
    expect(response.status).toBe(403);
  });
});

describe('Cache-Control on the session routes', () => {
  test.each(SESSION_ROUTES)(
    '%s %s answers no-store on success and on failure',
    async (method, path) => {
      const refreshToken = await signIn(harness);
      const success = await callSession(harness, {
        path,
        method,
        cookie: refreshToken,
        body: buildValidExchangeBody(),
      });
      const failure = await callSession(harness, { path, method, omitHeaders: ['Origin'] });
      expect(success.headers.get('Cache-Control')).toBe('no-store');
      expect(failure.headers.get('Cache-Control')).toBe('no-store');
    },
  );
});

describe('secrets never reach the log or the error messages', () => {
  test('code, verifier, cookie and tokens are absent from the captured log', async () => {
    const secrets: string[] = [FAKE_VALID_CODE, FAKE_CODE_VERIFIER];
    const created = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'POST',
      body: buildValidExchangeBody(),
    });
    const refreshToken = readCookieValue(created);
    const accessToken = ((await created.json()) as { data: { accessToken: string } }).data
      .accessToken;
    secrets.push(refreshToken, accessToken);
    const renewed = await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: refreshToken,
    });
    secrets.push(readCookieValue(renewed));
    await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'DELETE',
      cookie: readCookieValue(renewed),
    });
    await callSession(harness, {
      path: REFRESH_URL_PATH,
      method: 'POST',
      cookie: 'leaked-cookie-value',
    });
    const log = harness.api.logLines.join('');
    expect(log).toContain('"path":"/v1/session"');
    for (const secret of secrets) expect(log).not.toContain(secret);
    expect(log).not.toContain('leaked-cookie-value');
    expect(harness.api.reportedErrors).toStrictEqual([]);
  });

  test('error messages do not echo the values they refused', async () => {
    const response = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'POST',
      body: { ...buildValidExchangeBody(), redirectUri: 'http://evil.test/echo-marker-123' },
    });
    expect(await response.text()).not.toContain('echo-marker-123');
    const invalid = await callSession(harness, {
      path: SESSION_URL_PATH,
      method: 'POST',
      body: { code: 'echo-marker-456', extra: 1 },
    });
    expect(await invalid.text()).not.toContain('echo-marker-456');
  });
});

describe('route declaration', () => {
  test('the session and ticket routes declare access explicitly', () => {
    const declared = harness.api.routes
      .filter(
        (route) => route.path.startsWith('/v1/session') || route.path.startsWith('/v1/stream'),
      )
      .map((route) => `${route.method} ${route.path} ${route.access}`);
    expect(declared.sort()).toStrictEqual([
      'DELETE /v1/session public',
      'POST /v1/session public',
      'POST /v1/session/refresh public',
      'POST /v1/stream/tickets user',
    ]);
  });
});
