// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '@cryptoada/database';

import type { AuthenticatedUser } from '../authentication/authenticated-user.js';
import type { AuthenticationLevel } from '../authentication/authentication.constant.js';
import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import type { RateLimitCharge, RateLimitPolicy } from '../rate-limit/rate-limit-policy.constant.js';
import type { HttpMethod } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { ROUTE_ACCESS, type ProtectedRouteAccess } from './route-access.constant.js';

export type PublicRouteContext = {
  readonly request: Request;
  readonly traceId: string;
  readonly clientAddress: string;
  readonly pathParams: Readonly<Record<string, string>>;
};

export type ProtectedRouteContext = PublicRouteContext & {
  readonly authenticatedUser: AuthenticatedUser;
  readonly scope: OwnerScope;
  readonly authenticationLevel: AuthenticationLevel;
  readonly authenticationTime: number | undefined;
};

type RouteBase = {
  readonly method: HttpMethod;
  readonly path: string;
  readonly rateLimitPolicy?: RateLimitPolicy;
  readonly rateLimitCharge?: RateLimitCharge;
  // O que o OpenAPI gerado diz desta rota (T3.4); o gerador recusa a tabela com rota sem documentação.
  readonly documentation?: RouteDocumentation;
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
