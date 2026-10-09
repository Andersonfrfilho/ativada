// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '@crypto/database';

import type { AuthenticatedUser } from '../authentication/authenticated-user.js';
import type { AuthenticationLevel } from '../authentication/authentication.constant.js';
import type { RateLimitPolicy } from '../rate-limit/rate-limit-policy.constant.js';
import type { HttpMethod } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { ROUTE_ACCESS, type ProtectedRouteAccess } from './route-access.constant.js';

export type PublicRouteContext = {
  readonly request: Request;
  readonly traceId: string;
};

export type ProtectedRouteContext = PublicRouteContext & {
  readonly authenticatedUser: AuthenticatedUser;
  readonly scope: OwnerScope;
  readonly authenticationLevel: AuthenticationLevel;
};

type RouteBase = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly rateLimitPolicy?: RateLimitPolicy;
};

export type PublicRoute = RouteBase & {
  readonly access: typeof ROUTE_ACCESS.PUBLIC;
  readonly handler: (context: PublicRouteContext) => Promise<RouteResult>;
};

export type ProtectedRoute = RouteBase & {
  readonly access: ProtectedRouteAccess;
  readonly handler: (context: ProtectedRouteContext) => Promise<RouteResult>;
};

export type Route = PublicRoute | ProtectedRoute;
