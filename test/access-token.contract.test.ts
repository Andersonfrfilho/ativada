// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { SignJWT, errors } from './fixtures/jose.fixture.js';

import {
  createAccessTokenVerifier,
  type AccessTokenVerifier,
  type TokenVerification,
} from '../apps/api-crypto/src/authentication/access-token-verifier.js';
import {
  AUTHENTICATION_LEVEL,
  REJECTION_REASON,
  TOKEN_VERIFICATION_STATUS,
  type RejectionReason,
} from '../apps/api-crypto/src/authentication/authentication.constant.js';
import { createRemoteKeyResolver } from '../apps/api-crypto/src/authentication/remote-key-resolver.js';
import {
  JWKS_SERVER_MODE,
  startJwksTestServer,
  type JwksTestServer,
} from './fixtures/jwks-test-server.fixture.js';
import {
  TEST_AUDIENCE,
  TEST_AUTHORIZED_PARTY,
  TEST_ISSUER,
  TEST_SUBJECT,
  buildUnsignedToken,
  createTestSigningKey,
  signTestToken,
  type TestSigningKey,
} from './fixtures/token-signing.fixture.js';

const SETTINGS = {
  issuer: TEST_ISSUER,
  audience: TEST_AUDIENCE,
  authorizedParties: [TEST_AUTHORIZED_PARTY],
};
const JWKS_TIMEOUT_MILLISECONDS = 300;
const JWKS_COOLDOWN_MILLISECONDS = 50;
const SECONDS_PER_MINUTE = 60;

let signingKey: TestSigningKey;
let otherKey: TestSigningKey;
let jwks: JwksTestServer;
let verifyAccessToken: AccessTokenVerifier;

function expectRejected(verification: TokenVerification, reason: RejectionReason): void {
  expect(verification).toStrictEqual({ status: TOKEN_VERIFICATION_STATUS.REJECTED, reason });
}

beforeAll(async () => {
  signingKey = await createTestSigningKey('key-1');
  otherKey = await createTestSigningKey('key-1');
  jwks = startJwksTestServer([signingKey]);
  verifyAccessToken = createAccessTokenVerifier({
    settings: SETTINGS,
    getKey: createRemoteKeyResolver({
      jwksUrl: jwks.url,
      timeoutMilliseconds: JWKS_TIMEOUT_MILLISECONDS,
      cooldownMilliseconds: JWKS_COOLDOWN_MILLISECONDS,
    }),
  });
});

afterAll(async () => {
  await jwks.stop();
});

describe('access token verification (ADR 0001 §b)', () => {
  test('accepts a valid token and returns normalized claims', async () => {
    const token = await signTestToken({
      key: signingKey,
      claims: { realm_access: { roles: ['user', 'admin', 'offline_access'] }, acr: '2' },
    });
    const verification = await verifyAccessToken(token);
    expect(verification.status).toBe(TOKEN_VERIFICATION_STATUS.AUTHENTICATED);
    if (verification.status !== TOKEN_VERIFICATION_STATUS.AUTHENTICATED) return;
    expect(verification.token.subject).toBe(TEST_SUBJECT);
    expect(verification.token.roles).toStrictEqual(['user', 'admin']);
    expect(verification.token.authenticationLevel).toBe(AUTHENTICATION_LEVEL.MULTI_FACTOR);
    expect(verification.token.isEmailVerified).toBe(true);
  });

  test.each([
    ['password', AUTHENTICATION_LEVEL.PASSWORD],
    ['2', AUTHENTICATION_LEVEL.MULTI_FACTOR],
    ['mfa', AUTHENTICATION_LEVEL.MULTI_FACTOR],
    ['0', AUTHENTICATION_LEVEL.PASSWORD],
    [undefined, AUTHENTICATION_LEVEL.PASSWORD],
  ])('normalizes acr %p to level %p', async (acr, expectedLevel) => {
    const verification = await verifyAccessToken(
      await signTestToken({ key: signingKey, claims: { acr } }),
    );
    expect(verification.status).toBe(TOKEN_VERIFICATION_STATUS.AUTHENTICATED);
    if (verification.status !== TOKEN_VERIFICATION_STATUS.AUTHENTICATED) return;
    expect(verification.token.authenticationLevel).toBe(expectedLevel);
  });

  test('rejects an expired token as expired', async () => {
    const token = await signTestToken({
      key: signingKey,
      issuedSecondsAgo: 10 * SECONDS_PER_MINUTE,
      lifetimeSeconds: 5 * SECONDS_PER_MINUTE,
    });
    expectRejected(await verifyAccessToken(token), REJECTION_REASON.EXPIRED);
  });

  test('rejects a token older than 15 minutes even when exp is far away', async () => {
    const token = await signTestToken({
      key: signingKey,
      issuedSecondsAgo: 16 * SECONDS_PER_MINUTE,
      lifetimeSeconds: 60 * SECONDS_PER_MINUTE,
    });
    expectRejected(await verifyAccessToken(token), REJECTION_REASON.EXPIRED);
  });

  test('rejects a signature made by another key with the same kid', async () => {
    const token = await signTestToken({ key: otherKey });
    expectRejected(await verifyAccessToken(token), REJECTION_REASON.INVALID);
  });

  test.each([
    ['iss', { iss: 'http://other.test/realms/x' }],
    ['aud', { aud: 'another-api' }],
    ['azp', { azp: 'crypto-panel' }],
    ['typ', { typ: 'ID' }],
    ['typ ausente', { typ: undefined }],
    ['sub ausente', { sub: undefined }],
    ['sub longo demais', { sub: 'x'.repeat(256) }],
    ['aud ausente', { aud: undefined }],
  ])('rejects wrong or missing %s', async (_name, claims) => {
    const token = await signTestToken({ key: signingKey, claims });
    expectRejected(await verifyAccessToken(token), REJECTION_REASON.INVALID);
  });

  test('rejects alg none', async () => {
    const token = buildUnsignedToken({});
    expectRejected(await verifyAccessToken(token), REJECTION_REASON.INVALID);
  });

  test('rejects an HS256 token signed with a symmetric secret', async () => {
    const secret = new TextEncoder().encode('0123456789abcdef0123456789abcdef');
    const token = await new SignJWT({ typ: 'Bearer', azp: TEST_AUTHORIZED_PARTY })
      .setProtectedHeader({ alg: 'HS256', kid: signingKey.keyId })
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setSubject(TEST_SUBJECT)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);
    expectRejected(await verifyAccessToken(token), REJECTION_REASON.INVALID);
  });

  test('rejects garbage that has the shape of a token', async () => {
    expectRejected(await verifyAccessToken('aaa.bbb.ccc'), REJECTION_REASON.INVALID);
  });

  test('accepts a key published after rotation once the cooldown has passed', async () => {
    const rotatedKey = await createTestSigningKey('key-rotated');
    const token = await signTestToken({ key: rotatedKey });
    expectRejected(await verifyAccessToken(token), REJECTION_REASON.INVALID);
    jwks.publishKey(rotatedKey);
    await Bun.sleep(JWKS_COOLDOWN_MILLISECONDS + 30);
    expect((await verifyAccessToken(token)).status).toBe(TOKEN_VERIFICATION_STATUS.AUTHENTICATED);
  });
});

describe('failure classification: only a closed list of JWT errors is a 401', () => {
  function createVerifierAgainst(server: JwksTestServer): AccessTokenVerifier {
    return createAccessTokenVerifier({
      settings: SETTINGS,
      getKey: createRemoteKeyResolver({
        jwksUrl: server.url,
        timeoutMilliseconds: JWKS_TIMEOUT_MILLISECONDS,
      }),
    });
  }

  test.each([JWKS_SERVER_MODE.DOWN, JWKS_SERVER_MODE.SLOW, JWKS_SERVER_MODE.GARBAGE])(
    'JWKS in mode %s makes the verifier unavailable, never authenticated',
    async (mode) => {
      const brokenServer = startJwksTestServer([signingKey]);
      brokenServer.setMode(mode);
      try {
        const verifier = createVerifierAgainst(brokenServer);
        const verification = await verifier(await signTestToken({ key: signingKey }));
        expect(verification).toStrictEqual({ status: TOKEN_VERIFICATION_STATUS.UNAVAILABLE });
      } finally {
        await brokenServer.stop();
      }
    },
  );

  test('an unreachable JWKS host makes the verifier unavailable', async () => {
    const closedServer = startJwksTestServer([signingKey]);
    const closedUrl = closedServer.url;
    await closedServer.stop();
    const verifier = createAccessTokenVerifier({
      settings: SETTINGS,
      getKey: createRemoteKeyResolver({
        jwksUrl: closedUrl,
        timeoutMilliseconds: JWKS_TIMEOUT_MILLISECONDS,
      }),
    });
    expect(await verifier(await signTestToken({ key: signingKey }))).toStrictEqual({
      status: TOKEN_VERIFICATION_STATUS.UNAVAILABLE,
    });
  });

  test.each([
    ['generic Error', new Error('boom')],
    ['TypeError', new TypeError('fetch failed')],
    ['generic JOSEError', new errors.JOSEError('generic jose failure')],
    ['JWKSTimeout', new errors.JWKSTimeout()],
    ['JWKSInvalid', new errors.JWKSInvalid('bad jwks')],
  ])('an unknown failure (%s) while resolving the key is unavailable', async (_name, failure) => {
    const verifier = createAccessTokenVerifier({
      settings: SETTINGS,
      getKey: () => Promise.reject(failure),
    });
    expect(await verifier(await signTestToken({ key: signingKey }))).toStrictEqual({
      status: TOKEN_VERIFICATION_STATUS.UNAVAILABLE,
    });
  });
});
