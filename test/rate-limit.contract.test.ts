// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  RATE_LIMIT_KEY_SCOPE,
  RATE_LIMIT_POLICY,
  type RateLimitPolicy,
} from '../apps/api-ativada/src/rate-limit/rate-limit-policy.constant.js';
import {
  createRateLimiter,
  type RateLimiterOptions,
} from '../apps/api-ativada/src/rate-limit/rate-limiter.js';
import {
  resolveClientAddress,
  toRateLimitAddressKey,
} from '../apps/api-ativada/src/rate-limit/resolve-client-address.js';
import type { AccessTokenVerifier } from '../apps/api-ativada/src/authentication/access-token-verifier.js';
import { createRouter } from '../apps/api-ativada/src/router/create-router.js';
import { ROUTE_ACCESS } from '../apps/api-ativada/src/router/route-access.constant.js';
import { RATE_LIMIT_ERROR_CODE } from '../apps/api-ativada/src/shared/errors/error-code.constant.js';
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

describe('dev limit multiplier', () => {
  test('multiplies the allowance of every policy and defaults to 1', () => {
    const policy = RATE_LIMIT_POLICY.CANDLE_QUERY;
    const countAllowed = (options: RateLimiterOptions): number => {
      const limiter = createRateLimiter(options);
      let allowed = 0;
      while (limiter.consume({ policy, key: 'a' }).isAllowed) allowed += 1;
      return allowed;
    };
    expect(countAllowed({ now: () => 0 })).toBe(policy.limit);
    expect(countAllowed({ now: () => 0, limitMultiplier: 1 })).toBe(policy.limit);
    expect(countAllowed({ now: () => 0, limitMultiplier: 4 })).toBe(policy.limit * 4);
  });

  test('peek sees the scaled allowance too', () => {
    const policy = RATE_LIMIT_POLICY.ACCOUNT_EXPORT;
    const limiter = createRateLimiter({ now: () => 0, limitMultiplier: 3 });
    for (let attempt = 0; attempt < 3; attempt += 1) limiter.consume({ policy, key: 'a' });
    expect(limiter.peek({ policy, key: 'a' }).isAllowed).toBe(false);
    const wider = createRateLimiter({ now: () => 0, limitMultiplier: 3 });
    for (let attempt = 0; attempt < 2; attempt += 1) wider.consume({ policy, key: 'a' });
    expect(wider.peek({ policy, key: 'a' }).isAllowed).toBe(true);
  });
});

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

  test('keeps the number of tracked keys of a policy bounded by its own ceiling', () => {
    const limiter = createRateLimiter({ now: () => 0 });
    const policy = RATE_LIMIT_POLICY.UNAUTHENTICATED_CLIENT_ADDRESS;
    for (let index = 0; index < policy.maxTrackedKeys + 500; index += 1) {
      limiter.consume({ policy, key: `address-${index}` });
    }
    expect(limiter.trackedKeyCount(policy)).toBe(policy.maxTrackedKeys);
    expect(limiter.consume({ policy, key: 'address-last' }).isAllowed).toBe(true);
  });

  test('a flood of new keys in one policy never evicts the active bucket of another policy', () => {
    const limiter = createRateLimiter({ now: () => 0 });
    const user = RATE_LIMIT_POLICY.AUTHENTICATED_USER;
    const flooded = RATE_LIMIT_POLICY.UNAUTHENTICATED_CLIENT_ADDRESS;
    for (let attempt = 0; attempt < user.limit - 1; attempt += 1) {
      limiter.consume({ policy: user, key: 'legitimate-user' });
    }
    for (let index = 0; index < flooded.maxTrackedKeys * 2; index += 1) {
      limiter.consume({ policy: flooded, key: `attacker-${index}` });
    }
    expect(limiter.trackedKeyCount(user)).toBe(1);
    expect(limiter.consume({ policy: user, key: 'legitimate-user' }).isAllowed).toBe(true);
    expect(limiter.consume({ policy: user, key: 'legitimate-user' }).isAllowed).toBe(false);
  });

  describe('least recently used eviction', () => {
    const tiny: RateLimitPolicy = {
      name: 'tiny',
      limit: 5,
      windowMilliseconds: 1_000_000,
      keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
      maxTrackedKeys: 2,
    };

    function drain(limiter: ReturnType<typeof createRateLimiter>, key: string): number {
      let allowed = 0;
      while (limiter.consume({ policy: tiny, key }).isAllowed && allowed < 10) allowed += 1;
      return allowed;
    }

    test('using a key makes it the most recent: the idle-longest key is the one evicted', () => {
      const limiter = createRateLimiter({ now: () => 0 });
      limiter.consume({ policy: tiny, key: 'a' });
      limiter.consume({ policy: tiny, key: 'b' });
      limiter.consume({ policy: tiny, key: 'a' });
      limiter.consume({ policy: tiny, key: 'c' });
      expect(limiter.trackedKeyCount(tiny)).toBe(2);
      expect(drain(limiter, 'a')).toBe(3);
      expect(drain(limiter, 'b')).toBe(5);
    });

    test('buckets whose window already passed go before any active bucket', () => {
      let now = 0;
      const limiter = createRateLimiter({ now: () => now });
      limiter.consume({ policy: tiny, key: 'old' });
      now = tiny.windowMilliseconds - 1;
      limiter.consume({ policy: tiny, key: 'active' });
      now = tiny.windowMilliseconds;
      limiter.consume({ policy: tiny, key: 'new' });
      expect(drain(limiter, 'active')).toBe(4);
    });
  });

  test('peek answers without spending a token', () => {
    const limiter = createRateLimiter({ now: () => 0 });
    const policy = RATE_LIMIT_POLICY.ACCOUNT_EXPORT;
    expect(limiter.peek({ policy, key: 'a' }).isAllowed).toBe(true);
    expect(limiter.peek({ policy, key: 'a' }).isAllowed).toBe(true);
    expect(limiter.consume({ policy, key: 'a' }).isAllowed).toBe(true);
    expect(limiter.peek({ policy, key: 'a' }).isAllowed).toBe(false);
  });
});

describe('rate limit key of a client address', () => {
  test('keeps IPv4 and unknown addresses as they are', () => {
    expect(toRateLimitAddressKey('203.0.113.7')).toBe('203.0.113.7');
    expect(toRateLimitAddressKey('unknown')).toBe('unknown');
  });

  test('aggregates IPv6 by /64, in any notation', () => {
    const base = toRateLimitAddressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(toRateLimitAddressKey('2001:0db8:0001:0002::1')).toBe(base);
    expect(toRateLimitAddressKey('2001:DB8:1:2:ffff:ffff:ffff:ffff')).toBe(base);
    expect(toRateLimitAddressKey('2001:db8:1:3::1')).not.toBe(base);
    expect(toRateLimitAddressKey('2001:db8::1')).toBe(toRateLimitAddressKey('2001:db8:0:0::2'));
  });

  test('an IPv4-mapped IPv6 address is the IPv4 address', () => {
    expect(toRateLimitAddressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  test('requests from different addresses of one /64 share the unauthenticated bucket', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const socketAddress = `2001:db8:1:2::${(attempt + 1).toString(16)}`;
      expect((await harness.send({ path: USER_PATH, socketAddress })).status).toBe(401);
    }
    const blocked = await harness.send({ path: USER_PATH, socketAddress: '2001:db8:1:2::ffff' });
    expect(blocked.status).toBe(429);
    const otherPrefix = await harness.send({ path: USER_PATH, socketAddress: '2001:db8:1:3::1' });
    expect(otherPrefix.status).toBe(401);
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

describe('address charge before token verification', () => {
  const DEFAULT_ADDRESS = '203.0.113.7';

  function createSpyRouter(): {
    send: (authorization?: string) => Promise<Response>;
    verified: () => number;
  } {
    let verifications = 0;
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: USER_PATH,
          access: ROUTE_ACCESS.USER,
          handler: (): Promise<{ status: number; data: unknown }> =>
            Promise.resolve({ status: 200, data: {} }),
        },
      ],
      verifyAccessToken: (): ReturnType<AccessTokenVerifier> => {
        verifications += 1;
        return Promise.reject(new Error('must not be reached'));
      },
      resolveUser: () => Promise.reject(new Error('not used')),
      rateLimiter: createRateLimiter({ now: () => 0 }),
      trustedProxyHops: 0,
      reportUnexpectedError: () => undefined,
    });
    return {
      send: (authorization) =>
        router({
          request: new Request(`http://api.test${USER_PATH}`, {
            ...(authorization === undefined ? {} : { headers: { Authorization: authorization } }),
          }),
          socketAddress: DEFAULT_ADDRESS,
          traceId: 'trace-spy',
        }),
      verified: () => verifications,
    };
  }

  test.each([
    ['no token', undefined],
    ['a token that is not shaped like a JWT', 'Bearer not-a-jwt'],
    ['a header that is not a Bearer', 'Basic dXNlcjpwYXNz'],
    ['an oversized header', `Bearer ${'a'.repeat(9_000)}.b.c`],
  ])('%s is charged to the address and never reaches the verification', async (_name, header) => {
    const { send, verified } = createSpyRouter();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      expect((await send(header)).status).toBe(401);
    }
    expect((await send(header)).status).toBe(429);
    expect(verified()).toBe(0);
  });
});
