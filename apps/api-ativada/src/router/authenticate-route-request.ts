// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '@ativada/database';

import type { AuthenticatedUser } from '../authentication/authenticated-user.js';
import type { AccessTokenVerifier } from '../authentication/access-token-verifier.js';
import { assertRouteAuthorization } from '../authentication/authorize-route-access.js';
import {
  AccessTokenExpiredError,
  AuthenticationRequiredError,
  AuthenticationUnavailableError,
  EmailNotVerifiedError,
  InvalidAccessTokenError,
} from '../authentication/authentication.error.js';
import {
  REJECTION_REASON,
  TOKEN_VERIFICATION_STATUS,
  type AuthenticationLevel,
} from '../authentication/authentication.constant.js';
import { extractBearerToken } from '../authentication/bearer-token.js';
import {
  resolveAuthenticatedUser,
  type UserResolver,
} from '../authentication/resolve-authenticated-user.js';
import type { VerifiedAccessToken } from '../authentication/token-claims.schema.js';
import { enforceRateLimit } from '../rate-limit/enforce-rate-limit.js';
import {
  RATE_LIMIT_CHARGE,
  RATE_LIMIT_KEY_SCOPE,
  RATE_LIMIT_POLICY,
} from '../rate-limit/rate-limit-policy.constant.js';
import type { RateLimiter } from '../rate-limit/rate-limiter.js';
import { toRateLimitAddressKey } from '../rate-limit/resolve-client-address.js';
import type { ProtectedRoute } from './route.types.js';

export type AuthenticationPipelineDependencies = {
  readonly verifyAccessToken: AccessTokenVerifier;
  readonly resolveUser: UserResolver;
  readonly rateLimiter: RateLimiter;
};

export type AuthenticateRouteRequestParams = {
  readonly route: ProtectedRoute;
  readonly request: Request;
  readonly clientAddress: string;
  readonly dependencies: AuthenticationPipelineDependencies;
};

export type RouteAuthentication = {
  readonly authenticatedUser: AuthenticatedUser;
  readonly scope: OwnerScope;
  readonly authenticationLevel: AuthenticationLevel;
  readonly authenticationTime: number | undefined;
  readonly accessTokenExpiresAtMilliseconds: number;
};

function chargeClientAddress(
  dependencies: AuthenticationPipelineDependencies,
  address: string,
): void {
  enforceRateLimit({
    rateLimiter: dependencies.rateLimiter,
    policy: RATE_LIMIT_POLICY.UNAUTHENTICATED_CLIENT_ADDRESS,
    key: toRateLimitAddressKey(address),
  });
}

async function verifyBearerToken(
  params: AuthenticateRouteRequestParams,
): Promise<VerifiedAccessToken> {
  const bearerToken = extractBearerToken(params.request);
  if (bearerToken === undefined) {
    chargeClientAddress(params.dependencies, params.clientAddress);
    throw new AuthenticationRequiredError();
  }
  const verification = await params.dependencies.verifyAccessToken(bearerToken);
  if (verification.status === TOKEN_VERIFICATION_STATUS.AUTHENTICATED) return verification.token;
  if (verification.status === TOKEN_VERIFICATION_STATUS.UNAVAILABLE) {
    throw new AuthenticationUnavailableError();
  }
  chargeClientAddress(params.dependencies, params.clientAddress);
  if (verification.reason === REJECTION_REASON.EXPIRED) throw new AccessTokenExpiredError();
  throw new InvalidAccessTokenError();
}

function enforceRouteRateLimits(params: AuthenticateRouteRequestParams, subject: string): void {
  const { rateLimiter } = params.dependencies;
  enforceRateLimit({ rateLimiter, policy: RATE_LIMIT_POLICY.AUTHENTICATED_USER, key: subject });
  const { rateLimitPolicy } = params.route;
  const isDeferred = params.route.rateLimitCharge === RATE_LIMIT_CHARGE.AFTER_SUCCESS;
  if (rateLimitPolicy === undefined || isDeferred) return;
  const isSubjectScoped = rateLimitPolicy.keyScope === RATE_LIMIT_KEY_SCOPE.SUBJECT;
  enforceRateLimit({
    rateLimiter,
    policy: rateLimitPolicy,
    key: isSubjectScoped ? subject : toRateLimitAddressKey(params.clientAddress),
  });
}

export async function authenticateRouteRequest(
  params: AuthenticateRouteRequestParams,
): Promise<RouteAuthentication> {
  const token = await verifyBearerToken(params);
  enforceRouteRateLimits(params, token.subject);
  if (!token.isEmailVerified) throw new EmailNotVerifiedError();
  assertRouteAuthorization({
    access: params.route.access,
    roles: token.roles,
    authenticationLevel: token.authenticationLevel,
  });
  const resolved = await resolveAuthenticatedUser({
    resolveUser: params.dependencies.resolveUser,
    token,
  });
  return {
    ...resolved,
    authenticationLevel: token.authenticationLevel,
    authenticationTime: token.authenticationTime,
    accessTokenExpiresAtMilliseconds: token.expiresAtMilliseconds,
  };
}
