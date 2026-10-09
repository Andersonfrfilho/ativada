// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IdentityContext } from './identity-context.js';
import { reportStep } from './identity-context.js';
import type { IdentityEnvironment } from './identity-environment.js';
import { buildRealmUrl } from './keycloak-client.js';
import { isJsonRecord, parseJsonRecord, sendRequest } from './http-client.js';
import { assertCondition, IdentityTestError } from './identity-test.error.js';

const READY_TIMEOUT_MILLISECONDS = 180_000;
const READY_POLL_MILLISECONDS = 2_000;

function buildDiscoveryUrl(environment: IdentityEnvironment): string {
  return `${buildRealmUrl(environment)}/.well-known/openid-configuration`;
}

export async function waitForRealm(environment: IdentityEnvironment): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    try {
      const result = await sendRequest({ url: buildDiscoveryUrl(environment) });
      if (result.status === 200) return;
    } catch {
      // Keycloak ainda subindo: tenta de novo até o prazo.
    }
    await Bun.sleep(READY_POLL_MILLISECONDS);
  }
  throw new IdentityTestError('o realm não respondeu o discovery OIDC a tempo');
}

export async function checkDiscovery(context: IdentityContext): Promise<void> {
  const { environment } = context;
  const discovery = parseJsonRecord(await sendRequest({ url: buildDiscoveryUrl(environment) }));
  const realmUrl = buildRealmUrl(environment);
  assertCondition(
    discovery['issuer'] === realmUrl,
    `issuer inesperado: ${String(discovery['issuer'])}`,
  );
  const jwksUri = discovery['jwks_uri'];
  assertCondition(
    jwksUri === `${realmUrl}/protocol/openid-connect/certs`,
    `jwks_uri inesperado: ${String(jwksUri)}`,
  );
  const methods = discovery['code_challenge_methods_supported'];
  assertCondition(Array.isArray(methods) && methods.includes('S256'), 'discovery sem PKCE S256');
  const jwks = parseJsonRecord(await sendRequest({ url: String(jwksUri) }));
  assertCondition(
    isJsonRecord(jwks) && Array.isArray(jwks['keys']) && jwks['keys'].length > 0,
    'JWKS vazio',
  );
  reportStep('discovery', `issuer ${realmUrl}, JWKS com chaves, PKCE S256 anunciado`);
}
