// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey, type JWK } from './jose.fixture.js';

export const TEST_ISSUER = 'http://keycloak.test/realms/ativada';
export const TEST_AUDIENCE = 'ativada-api';
export const TEST_AUTHORIZED_PARTY = 'ativada-session';
export const TEST_SUBJECT = 'subject-0001';

const SECONDS_PER_MINUTE = 60;

export type TestSigningKey = {
  readonly keyId: string;
  readonly privateKey: CryptoKey;
  readonly publicJwk: JWK;
};

export type SignTestTokenParams = {
  readonly key: TestSigningKey;
  readonly claims?: Readonly<Record<string, unknown>>;
  readonly algorithm?: string;
  readonly issuedSecondsAgo?: number;
  readonly lifetimeSeconds?: number;
};

export async function createTestSigningKey(keyId: string): Promise<TestSigningKey> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  return { keyId, privateKey, publicJwk: { ...publicJwk, kid: keyId, alg: 'RS256', use: 'sig' } };
}

export function buildDefaultClaims(): Record<string, unknown> {
  return {
    iss: TEST_ISSUER,
    aud: TEST_AUDIENCE,
    sub: TEST_SUBJECT,
    azp: TEST_AUTHORIZED_PARTY,
    typ: 'Bearer',
    email_verified: true,
    realm_access: { roles: ['user'] },
    acr: 'password',
  };
}

function mergeClaims(overrides: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const merged = { ...buildDefaultClaims(), ...overrides };
  for (const [claimName, claimValue] of Object.entries(merged)) {
    if (claimValue === undefined) delete merged[claimName];
  }
  return merged;
}

export async function signTestToken(params: SignTestTokenParams): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const issuedAt = nowSeconds - (params.issuedSecondsAgo ?? 0);
  const expiresAt = issuedAt + (params.lifetimeSeconds ?? 5 * SECONDS_PER_MINUTE);
  const claims = mergeClaims(params.claims ?? {});
  const builder = new SignJWT({ ...claims }).setProtectedHeader({
    alg: params.algorithm ?? 'RS256',
    kid: params.key.keyId,
  });
  if (!('iat' in claims)) builder.setIssuedAt(issuedAt);
  if (!('exp' in claims)) builder.setExpirationTime(expiresAt);
  return builder.sign(params.key.privateKey);
}

export function buildUnsignedToken(claims: Readonly<Record<string, unknown>>): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = { ...mergeClaims(claims), iat: nowSeconds, exp: nowSeconds + 300 };
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}
