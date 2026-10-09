// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  MAX_TRACKED_RATE_LIMIT_KEYS,
  RATE_LIMIT_POLICY,
} from '../apps/api-crypto/src/rate-limit/rate-limit-policy.constant.js';
import { createRateLimiter } from '../apps/api-crypto/src/rate-limit/rate-limiter.js';
import { resolveClientAddress } from '../apps/api-crypto/src/rate-limit/resolve-client-address.js';
import { RATE_LIMIT_ERROR_CODE } from '../apps/api-crypto/src/shared/errors/error-code.constant.js';
import {
  EXECUTION_PATH,
  PUBLIC_PATH,
  SESSION_PATH,
  USER_PATH,
  createApiHarness,
  type ApiHarness,
} from './fixtures/api-harness.fixture.js';
import { signTestToken } from './fixtures/token-signing.fixture.js';

const MINUTE_MILLISECONDS = 60_000;

let harness: ApiHarness;

beforeEach(async () => {
  harness = await createApiHarness();
});

afterEach(async () => {
  await harness.stop();
});

async function exhaust(send: () => Promise<Response>, count: number): Promise<void> {
  for (let attempt = 0; attempt < count; attempt += 1) {
    expect((await send()).status).toBe(200);
  }
}

describe('token bucket', () => {
  test('allows the limit, then denies with a positive retry-after, then refills', () => {
    let now = 0;
    const limiter = createRateLimiter({ now: () => now });
    const policy = RATE_LIMIT_POLICY.AUTHENTICATED_USER;
    for (let attempt = 0; attempt < policy.limit; attempt += 1) {
      expect(limiter.consume({ policy, key: 'a' }).isAllowed).toBe(true);
    }
    const denied = limiter.consume({ policy, key: 'a' });
    expect(denied.isAllowed).toBe(false);
    if (!denied.isAllowed) expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(limiter.consume({ policy, key: 'b' }).isAllowed).toBe(true);
    now += MINUTE_MILLISECONDS;
    expect(limiter.consume({ policy, key: 'a' }).isAllowed).toBe(true);
  });

  test('keeps the number of tracked keys bounded', () => {
    const limiter = createRateLimiter({ now: () => 0 });
    const policy = RATE_LIMIT_POLICY.UNAUTHENTICATED_CLIENT_ADDRESS;
    for (let index = 0; index < MAX_TRACKED_RATE_LIMIT_KEYS + 500; index += 1) {
      limiter.consume({ policy, key: `address-${index}` });
    }
    expect(limiter.consume({ policy, key: 'address-last' }).isAllowed).toBe(true);
  });
});

describe('client address', () => {
  const forwardedFor = '198.51.100.9, 192.0.2.44';

  test('ignores X-Forwarded-For when no proxy is trusted', () => {
    expect(
      resolveClientAddress({ socketAddress: '203.0.113.7', forwardedFor, trustedProxyHops: 0 }),
    ).toBe('203.0.113.7');
  });

  test('takes the entry added by the trusted proxy, counting from the right', () => {
    expect(
      resolveClientAddress({ socketAddress: '203.0.113.7', forwardedFor, trustedProxyHops: 1 }),
    ).toBe('192.0.2.44');
    expect(
      resolveClientAddress({ socketAddress: '203.0.113.7', forwardedFor, trustedProxyHops: 2 }),
    ).toBe('198.51.100.9');
  });

  test('falls back to the connection when the header is missing, short or not an address', () => {
    for (const header of [null, '198.51.100.9', 'not-an-ip, also-not']) {
      expect(
        resolveClientAddress({
          socketAddress: '203.0.113.7',
          forwardedFor: header,
          trustedProxyHops: 2,
        }),
      ).toBe('203.0.113.7');
    }
  });
});

describe('authenticated routes', () => {
  test('120 requests per minute per subject, then 429 with Retry-After', async () => {
    const token = await signTestToken({ key: harness.key });
    await exhaust(() => harness.send({ path: USER_PATH, token }), 120);
    const response = await harness.send({ path: USER_PATH, token });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      RATE_LIMIT_ERROR_CODE.RATE_LIMITED,
    );
  });

  test('is evaluated before any database access', async () => {
    const token = await signTestToken({ key: harness.key });
    await exhaust(() => harness.send({ path: USER_PATH, token }), 120);
    expect(harness.resolvedSubjects).toHaveLength(120);
    await harness.send({ path: USER_PATH, token });
    await harness.send({ path: USER_PATH, token });
    expect(harness.resolvedSubjects).toHaveLength(120);
  });

  test('is per subject: another subject is not affected', async () => {
    const token = await signTestToken({ key: harness.key });
    await exhaust(() => harness.send({ path: USER_PATH, token }), 120);
    const otherToken = await signTestToken({ key: harness.key, claims: { sub: 'someone-else' } });
    expect((await harness.send({ path: USER_PATH, token: otherToken })).status).toBe(200);
  });

  test('execution creation has its own stricter per-subject limit', async () => {
    const token = await signTestToken({ key: harness.key });
    await exhaust(
      () => harness.send({ path: EXECUTION_PATH, method: 'POST', token }),
      RATE_LIMIT_POLICY.EXECUTION_CREATION.limit,
    );
    expect((await harness.send({ path: EXECUTION_PATH, method: 'POST', token })).status).toBe(429);
    expect((await harness.send({ path: USER_PATH, token })).status).toBe(200);
  });
});

describe('client address limits', () => {
  test('requests without a token are limited per address (30/min)', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await harness.send({ path: USER_PATH })).status).toBe(401);
    }
    const blocked = await harness.send({ path: USER_PATH });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).not.toBeNull();
    expect((await harness.send({ path: USER_PATH, socketAddress: '203.0.113.8' })).status).toBe(
      401,
    );
  });

  test('invalid tokens are charged to the address', async () => {
    const strangerToken = await signTestToken({ key: harness.key, claims: { aud: 'other' } });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await harness.send({ path: USER_PATH, token: strangerToken })).status).toBe(401);
    }
    expect((await harness.send({ path: USER_PATH, token: strangerToken })).status).toBe(429);
  });

  test('session-style public routes allow 10 per minute per address', async () => {
    await exhaust(() => harness.send({ path: SESSION_PATH, method: 'POST' }), 10);
    expect((await harness.send({ path: SESSION_PATH, method: 'POST' })).status).toBe(429);
    expect((await harness.send({ path: PUBLIC_PATH })).status).toBe(200);
  });

  test('X-Forwarded-For does not change the bucket without a trusted proxy', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await harness.send({
        path: USER_PATH,
        headers: { 'X-Forwarded-For': `198.51.100.${attempt + 1}` },
      });
    }
    const response = await harness.send({
      path: USER_PATH,
      headers: { 'X-Forwarded-For': '198.51.100.200' },
    });
    expect(response.status).toBe(429);
  });

  test('X-Forwarded-For is honoured behind one trusted proxy', async () => {
    const proxiedHarness = await createApiHarness({ trustedProxyHops: 1 });
    try {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await proxiedHarness.send({
          path: USER_PATH,
          headers: { 'X-Forwarded-For': '198.51.100.1' },
        });
      }
      expect(
        (
          await proxiedHarness.send({
            path: USER_PATH,
            headers: { 'X-Forwarded-For': '198.51.100.1' },
          })
        ).status,
      ).toBe(429);
      expect(
        (
          await proxiedHarness.send({
            path: USER_PATH,
            headers: { 'X-Forwarded-For': '198.51.100.2' },
          })
        ).status,
      ).toBe(401);
    } finally {
      await proxiedHarness.stop();
    }
  });
});
