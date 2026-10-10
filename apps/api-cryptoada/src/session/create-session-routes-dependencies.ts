// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AccessTokenVerifier } from '../authentication/access-token-verifier.js';
import type { Environment } from '../environment.js';
import { createCreateSessionUseCase } from './create-session.use-case.js';
import { createEndSessionUseCase } from './end-session.use-case.js';
import { createKeycloakTokenClient } from './keycloak-token-client.js';
import { createRefreshSessionUseCase } from './refresh-session.use-case.js';
import type { SessionRouteDependencies } from './session.routes.js';

export type SessionEnvironment = Pick<
  Environment,
  | 'KEYCLOAK_TOKEN_URL'
  | 'KEYCLOAK_LOGOUT_URL'
  | 'KEYCLOAK_SESSION_CLIENT_ID'
  | 'KEYCLOAK_SESSION_CLIENT_SECRET'
  | 'SESSION_ALLOWED_REDIRECT_URIS'
  | 'CORS_ALLOWED_ORIGINS'
>;

export type CreateSessionRouteDependenciesParams = {
  readonly environment: SessionEnvironment;
  readonly verifyAccessToken: AccessTokenVerifier;
};

export function createSessionRouteDependencies(
  params: CreateSessionRouteDependenciesParams,
): SessionRouteDependencies {
  const { environment, verifyAccessToken } = params;
  const tokenClient = createKeycloakTokenClient({
    tokenUrl: environment.KEYCLOAK_TOKEN_URL,
    logoutUrl: environment.KEYCLOAK_LOGOUT_URL,
    clientId: environment.KEYCLOAK_SESSION_CLIENT_ID,
    clientSecret: environment.KEYCLOAK_SESSION_CLIENT_SECRET,
  });
  return {
    createSession: createCreateSessionUseCase({
      tokenClient,
      verifyAccessToken,
      allowedRedirectUris: new Set(environment.SESSION_ALLOWED_REDIRECT_URIS),
    }),
    refreshSession: createRefreshSessionUseCase({
      tokenClient,
      verifyAccessToken,
      now: () => Date.now(),
    }),
    endSession: createEndSessionUseCase(tokenClient),
    allowedOrigins: new Set(environment.CORS_ALLOWED_ORIGINS),
  };
}
