// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AccessTokenVerifier } from '../authentication/access-token-verifier.js';
import { HTTP_HEADER } from '../shared/http/http.constant.js';
import { createRefreshDeduplicator } from './refresh-deduplicator.js';
import { buildRefreshCookie } from './session-cookie.js';
import {
  REFRESH_DEDUPLICATION_WINDOW_MILLISECONDS,
  REFRESH_OUTCOME_STATUS,
  TOKEN_GRANT_STATUS,
} from './session.constant.js';
import { SessionEndedError, SessionUnavailableError } from './session.error.js';
import type { KeycloakTokenClient, SessionTokens } from './keycloak-token-client.js';
import { ISSUED_TOKEN_CHECK, checkIssuedAccessToken } from './verify-issued-access-token.js';

export type RefreshSessionDependencies = {
  readonly tokenClient: KeycloakTokenClient;
  readonly verifyAccessToken: AccessTokenVerifier;
  readonly now: () => number;
};

export type RefreshSessionUseCase = (refreshToken: string | undefined) => Promise<SessionTokens>;

type RefreshOutcome =
  | { readonly status: typeof REFRESH_OUTCOME_STATUS.RENEWED; readonly tokens: SessionTokens }
  | { readonly status: typeof REFRESH_OUTCOME_STATUS.UNVERIFIABLE; readonly tokens: SessionTokens }
  | { readonly status: typeof REFRESH_OUTCOME_STATUS.ENDED }
  | { readonly status: typeof REFRESH_OUTCOME_STATUS.UNAVAILABLE };

async function renew(
  dependencies: RefreshSessionDependencies,
  refreshToken: string,
): Promise<RefreshOutcome> {
  const grant = await dependencies.tokenClient.refresh(refreshToken);
  if (grant.status === TOKEN_GRANT_STATUS.REJECTED) return { status: REFRESH_OUTCOME_STATUS.ENDED };
  if (grant.status === TOKEN_GRANT_STATUS.UNAVAILABLE) {
    return { status: REFRESH_OUTCOME_STATUS.UNAVAILABLE };
  }
  const check = await checkIssuedAccessToken(
    dependencies.verifyAccessToken,
    grant.tokens.accessToken,
  );
  if (check === ISSUED_TOKEN_CHECK.VALID) {
    return { status: REFRESH_OUTCOME_STATUS.RENEWED, tokens: grant.tokens };
  }
  if (check === ISSUED_TOKEN_CHECK.UNAVAILABLE) {
    return { status: REFRESH_OUTCOME_STATUS.UNVERIFIABLE, tokens: grant.tokens };
  }
  await dependencies.tokenClient.revoke(grant.tokens.refreshToken);
  return { status: REFRESH_OUTCOME_STATUS.ENDED };
}

function toTokens(outcome: RefreshOutcome): SessionTokens {
  if (outcome.status === REFRESH_OUTCOME_STATUS.RENEWED) return outcome.tokens;
  if (outcome.status === REFRESH_OUTCOME_STATUS.ENDED) throw new SessionEndedError();
  if (outcome.status === REFRESH_OUTCOME_STATUS.UNAVAILABLE) throw new SessionUnavailableError();
  // O Keycloak já rotacionou o refresh: sem regravar o cookie, a próxima tentativa o reusaria.
  throw new SessionUnavailableError({
    [HTTP_HEADER.SET_COOKIE]: buildRefreshCookie({
      value: outcome.tokens.refreshToken,
      maxAgeSeconds: outcome.tokens.refreshExpiresInSeconds,
    }),
  });
}

export function createRefreshSessionUseCase(
  dependencies: RefreshSessionDependencies,
): RefreshSessionUseCase {
  const deduplicator = createRefreshDeduplicator<RefreshOutcome>({
    now: dependencies.now,
    windowMilliseconds: REFRESH_DEDUPLICATION_WINDOW_MILLISECONDS,
  });

  return async (refreshToken) => {
    if (refreshToken === undefined) throw new SessionEndedError();
    const outcome = await deduplicator.run({
      refreshToken,
      perform: () => renew(dependencies, refreshToken),
      shouldRetain: (settled) => settled.status !== REFRESH_OUTCOME_STATUS.UNAVAILABLE,
    });
    return toTokens(outcome);
  };
}
