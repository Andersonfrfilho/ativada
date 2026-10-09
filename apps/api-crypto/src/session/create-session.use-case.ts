// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  AuthenticationUnavailableError,
  InvalidAccessTokenError,
} from '../authentication/authentication.error.js';
import type { AccessTokenVerifier } from '../authentication/access-token-verifier.js';
import { TOKEN_GRANT_STATUS } from './session.constant.js';
import {
  AuthorizationCodeRejectedError,
  RedirectUriNotAllowedError,
  SessionUnavailableError,
} from './session.error.js';
import type {
  ExchangeCodeParams,
  KeycloakTokenClient,
  SessionTokens,
} from './keycloak-token-client.js';
import { ISSUED_TOKEN_CHECK, checkIssuedAccessToken } from './verify-issued-access-token.js';

export type CreateSessionDependencies = {
  readonly tokenClient: KeycloakTokenClient;
  readonly verifyAccessToken: AccessTokenVerifier;
  readonly allowedRedirectUris: ReadonlySet<string>;
};

export type CreateSessionUseCase = (input: ExchangeCodeParams) => Promise<SessionTokens>;

export function createCreateSessionUseCase(
  dependencies: CreateSessionDependencies,
): CreateSessionUseCase {
  const { tokenClient, verifyAccessToken, allowedRedirectUris } = dependencies;

  return async (input) => {
    if (!allowedRedirectUris.has(input.redirectUri)) throw new RedirectUriNotAllowedError();
    const grant = await tokenClient.exchangeCode(input);
    if (grant.status === TOKEN_GRANT_STATUS.REJECTED) throw new AuthorizationCodeRejectedError();
    if (grant.status === TOKEN_GRANT_STATUS.UNAVAILABLE) throw new SessionUnavailableError();
    const check = await checkIssuedAccessToken(verifyAccessToken, grant.tokens.accessToken);
    if (check === ISSUED_TOKEN_CHECK.VALID) return grant.tokens;
    await tokenClient.revoke(grant.tokens.refreshToken);
    if (check === ISSUED_TOKEN_CHECK.UNAVAILABLE) throw new AuthenticationUnavailableError();
    throw new InvalidAccessTokenError();
  };
}
