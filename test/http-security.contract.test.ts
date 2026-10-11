// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  ALLOWED_ORIGIN,
  FOREIGN_ORIGIN,
  PUBLIC_PATH,
  USER_PATH,
  createApiHarness,
  type ApiHarness,
} from './fixtures/api-harness.fixture.js';
import { signTestToken } from './fixtures/token-signing.fixture.js';

const EXPECTED_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

let harness: ApiHarness;

beforeAll(async () => {
  harness = await createApiHarness();
});

afterAll(async () => {
  await harness.stop();
});

function expectSecurityHeaders(response: Response): void {
  for (const [name, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
    expect(response.headers.get(name)).toBe(value);
  }
  expect(response.headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
  const contentSecurityPolicy = response.headers.get('Content-Security-Policy') ?? '';
  expect(contentSecurityPolicy).toContain("default-src 'none'");
  expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
  expect(contentSecurityPolicy).not.toContain('unsafe-inline');
  expect(contentSecurityPolicy).not.toContain('unsafe-eval');
  const permissionsPolicy = response.headers.get('Permissions-Policy') ?? '';
  for (const feature of ['camera=()', 'microphone=()', 'geolocation=()']) {
    expect(permissionsPolicy).toContain(feature);
  }
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Trace-Id')).toMatch(/^[0-9a-f-]{36}$/);
}

describe('security headers are present on every response', () => {
  test('200, 401, 403, 404, 405 and 429 all carry them', async () => {
    const token = await signTestToken({ key: harness.key });
    const noRoleToken = await signTestToken({
      key: harness.key,
      claims: { realm_access: { roles: [] } },
    });
    const responses = [
      await harness.sendThroughHandler({ path: PUBLIC_PATH }),
      await harness.sendThroughHandler({ path: USER_PATH }),
      await harness.sendThroughHandler({ path: USER_PATH, token: noRoleToken }),
      await harness.sendThroughHandler({ path: '/v1/missing' }),
      await harness.sendThroughHandler({ path: USER_PATH, method: 'DELETE', token }),
    ];
    expect(responses.map((response) => response.status)).toStrictEqual([200, 401, 403, 404, 405]);
    for (const response of responses) expectSecurityHeaders(response);

    const limitedHarness = await createApiHarness();
    try {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await limitedHarness.sendThroughHandler({ path: USER_PATH });
      }
      const limited = await limitedHarness.sendThroughHandler({ path: USER_PATH });
      expect(limited.status).toBe(429);
      expectSecurityHeaders(limited);
    } finally {
      await limitedHarness.stop();
    }
  });

  test('a 500 carries them and leaks nothing', async () => {
    const failingHarness = await createApiHarness({ resolverFailure: new Error('secret detail') });
    try {
      const token = await signTestToken({ key: failingHarness.key });
      const response = await failingHarness.sendThroughHandler({ path: USER_PATH, token });
      expect(response.status).toBe(500);
      expectSecurityHeaders(response);
      expect(await response.text()).not.toContain('secret detail');
    } finally {
      await failingHarness.stop();
    }
  });
});

describe('CORS uses an exact allowlist with credentials', () => {
  test('an allowed origin is echoed exactly, with credentials and Vary', async () => {
    const response = await harness.sendThroughHandler({
      path: PUBLIC_PATH,
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  test('a foreign origin gets no CORS headers, and never a wildcard', async () => {
    for (const origin of [
      FOREIGN_ORIGIN,
      'null',
      `${ALLOWED_ORIGIN}.evil.test`,
      ALLOWED_ORIGIN.toUpperCase(),
    ]) {
      const response = await harness.sendThroughHandler({
        path: PUBLIC_PATH,
        headers: { Origin: origin },
      });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    }
  });

  test('a request without Origin gets no CORS headers', async () => {
    const response = await harness.sendThroughHandler({ path: PUBLIC_PATH });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('errors also carry CORS headers for the allowed origin', async () => {
    const response = await harness.sendThroughHandler({
      path: USER_PATH,
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
  });

  test('a preflight from an allowed origin answers 204 with methods and headers', async () => {
    const response = await harness.sendThroughHandler({
      path: USER_PATH,
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'authorization',
    );
    expect(Number(response.headers.get('Access-Control-Max-Age'))).toBeGreaterThan(0);
    expectSecurityHeaders(response);
  });

  test('the preflight lists every verb the routes use, PUT included', async () => {
    const response = await harness.sendThroughHandler({
      path: USER_PATH,
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'PUT' },
    });
    const methods = (response.headers.get('Access-Control-Allow-Methods') ?? '')
      .split(',')
      .map((method) => method.trim());
    expect(methods).toStrictEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
  });

  test('a preflight from a foreign origin is rejected without CORS headers', async () => {
    const response = await harness.sendThroughHandler({
      path: USER_PATH,
      method: 'OPTIONS',
      headers: { Origin: FOREIGN_ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'ORIGIN_NOT_ALLOWED',
    );
  });
});

describe('access log', () => {
  test('records method, path, status and trace id but never the query or the token', async () => {
    const loggingHarness = await createApiHarness();
    try {
      const token = await signTestToken({ key: loggingHarness.key });
      await loggingHarness.sendThroughHandler({
        path: `${USER_PATH}?ticket=ticket-secreto&code=codigo-secreto`,
        token,
      });
      const output = loggingHarness.logLines.join('');
      expect(output).toContain(USER_PATH);
      expect(output).toContain('"status":200');
      for (const leaked of ['ticket-secreto', 'codigo-secreto', token]) {
        expect(output).not.toContain(leaked);
      }
    } finally {
      await loggingHarness.stop();
    }
  });
});
