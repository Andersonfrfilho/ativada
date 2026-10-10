// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_ACCESS, type ProtectedRouteAccess } from '../router/route-access.constant.js';
import { ForbiddenError, MfaRequiredError } from './authentication.error.js';
import { AUTHENTICATION_LEVEL, type AuthenticationLevel } from './authentication.constant.js';
import { USER_ROLE, type UserRole } from './user-role.constant.js';

export type RouteAuthorizationParams = {
  readonly access: ProtectedRouteAccess;
  readonly roles: readonly UserRole[];
  readonly authenticationLevel: AuthenticationLevel;
};

const REQUIRED_ROLE_BY_ACCESS: Readonly<Record<ProtectedRouteAccess, UserRole>> = {
  [ROUTE_ACCESS.USER]: USER_ROLE.USER,
  [ROUTE_ACCESS.ADMIN]: USER_ROLE.ADMIN,
};

export function assertRouteAuthorization(params: RouteAuthorizationParams): void {
  if (!params.roles.includes(REQUIRED_ROLE_BY_ACCESS[params.access])) throw new ForbiddenError();
  const requiresMultiFactor = params.access === ROUTE_ACCESS.ADMIN;
  if (requiresMultiFactor && params.authenticationLevel < AUTHENTICATION_LEVEL.MULTI_FACTOR) {
    throw new MfaRequiredError();
  }
}
