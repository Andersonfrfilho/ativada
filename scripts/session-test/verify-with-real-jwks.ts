// Copyright (c) 2026 Ada Technology. All rights reserved.
import { TOKEN_VERIFICATION_STATUS } from '../../apps/api-ativada/src/authentication/authentication.constant.js';
import { decodeTokenPayload } from '../identity-test/keycloak-client.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import { EXPECTED_AUDIENCE, SESSION_CLIENT_ID } from './session-test.constant.js';
import type { SessionFlowContext } from './session-flow-context.js';

export async function assertAccessTokenIsAccepted(
  flow: SessionFlowContext,
  accessToken: string,
): Promise<void> {
  const verification = await flow.verifyAccessToken(accessToken);
  assertCondition(
    verification.status === TOKEN_VERIFICATION_STATUS.AUTHENTICATED,
    `o verificador da API recusou o access token: ${verification.status}`,
  );
  const claims = decodeTokenPayload(accessToken);
  const audience = claims['aud'];
  const hasAudience = Array.isArray(audience)
    ? audience.includes(EXPECTED_AUDIENCE)
    : audience === EXPECTED_AUDIENCE;
  assertCondition(claims['azp'] === SESSION_CLIENT_ID, `azp: ${String(claims['azp'])}`);
  assertCondition(hasAudience, `aud sem ${EXPECTED_AUDIENCE}: ${String(audience)}`);
}
