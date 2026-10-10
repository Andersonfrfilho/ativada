// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runWithDeferredCharge } from '../rate-limit/deferred-rate-limit-charge.js';
import { enforceRateLimit } from '../rate-limit/enforce-rate-limit.js';
import {
  RATE_LIMIT_CHARGE,
  RATE_LIMIT_KEY_SCOPE,
  RATE_LIMIT_POLICY,
} from '../rate-limit/rate-limit-policy.constant.js';
import {
  resolveClientAddress,
  toRateLimitAddressKey,
} from '../rate-limit/resolve-client-address.js';
import { toErrorResponse } from '../shared/http/exception-filter.js';
import { HTTP_HEADER } from '../shared/http/http.constant.js';
import { buildSuccessResponse, type RouteResult } from '../shared/http/response-envelope.js';
import {
  authenticateRouteRequest,
  type AuthenticationPipelineDependencies,
} from './authenticate-route-request.js';
import { ROUTE_ACCESS } from './route-access.constant.js';
import {
  ROUTE_LOOKUP_KIND,
  createRouteTable,
  type PathParams,
  type RouteTable,
} from './route-table.js';
import { MethodNotAllowedError, RouteNotFoundError } from './routing.error.js';
import type { ProtectedRoute, PublicRoute, Route } from './route.types.js';

export type RouterDependencies = AuthenticationPipelineDependencies & {
  readonly routes: readonly Route[];
  readonly trustedProxyHops: number;
  readonly reportUnexpectedError: (error: unknown, traceId: string) => void;
};

export type RouterRequest = {
  readonly request: Request;
  readonly socketAddress: string | undefined;
  readonly traceId: string;
};

export type Router = (routerRequest: RouterRequest) => Promise<Response>;

type DispatchParams = {
  readonly inFlightChargeKeys: Set<string>;
  readonly routeTable: RouteTable;
  readonly dependencies: RouterDependencies;
  readonly routerRequest: RouterRequest;
};

type RouteRun = {
  readonly dispatch: DispatchParams;
  readonly pathParams: PathParams;
  readonly clientAddress: string;
};

function runPublicRoute(run: RouteRun, route: PublicRoute): Promise<RouteResult> {
  const { request, traceId } = run.dispatch.routerRequest;
  const { pathParams, clientAddress } = run;
  enforceRateLimit({
    rateLimiter: run.dispatch.dependencies.rateLimiter,
    policy: route.rateLimitPolicy ?? RATE_LIMIT_POLICY.UNAUTHENTICATED_CLIENT_ADDRESS,
    key: toRateLimitAddressKey(clientAddress),
  });
  return route.handler({ request, traceId, clientAddress, pathParams });
}

async function runAuthenticatedRoute(run: RouteRun, route: ProtectedRoute): Promise<RouteResult> {
  const { dependencies, inFlightChargeKeys } = run.dispatch;
  const { request, traceId } = run.dispatch.routerRequest;
  const { pathParams, clientAddress } = run;
  const authentication = await authenticateRouteRequest({
    route,
    request,
    clientAddress,
    dependencies,
  });
  const context = { request, traceId, clientAddress, pathParams, ...authentication };
  const { rateLimitPolicy } = route;
  if (rateLimitPolicy === undefined || route.rateLimitCharge !== RATE_LIMIT_CHARGE.AFTER_SUCCESS) {
    return route.handler(context);
  }
  const isSubjectScoped = rateLimitPolicy.keyScope === RATE_LIMIT_KEY_SCOPE.SUBJECT;
  return runWithDeferredCharge(
    {
      rateLimiter: dependencies.rateLimiter,
      policy: rateLimitPolicy,
      key: isSubjectScoped
        ? authentication.authenticatedUser.keycloakSubject
        : toRateLimitAddressKey(clientAddress),
      inFlightKeys: inFlightChargeKeys,
    },
    () => route.handler(context),
  );
}

function runRoute(
  params: DispatchParams,
  route: Route,
  pathParams: PathParams,
): Promise<RouteResult> {
  const { request, socketAddress } = params.routerRequest;
  const clientAddress = resolveClientAddress({
    socketAddress,
    forwardedFor: request.headers.get(HTTP_HEADER.FORWARDED_FOR),
    trustedProxyHops: params.dependencies.trustedProxyHops,
  });
  const run: RouteRun = { dispatch: params, pathParams, clientAddress };
  return route.access === ROUTE_ACCESS.PUBLIC
    ? runPublicRoute(run, route)
    : runAuthenticatedRoute(run, route);
}

async function dispatch(params: DispatchParams): Promise<Response> {
  const { request } = params.routerRequest;
  const lookup = params.routeTable.find(request.method, new URL(request.url).pathname);
  if (lookup.kind === ROUTE_LOOKUP_KIND.NOT_FOUND) throw new RouteNotFoundError();
  if (lookup.kind === ROUTE_LOOKUP_KIND.METHOD_NOT_ALLOWED) {
    throw new MethodNotAllowedError(lookup.allowedMethods);
  }
  return buildSuccessResponse(await runRoute(params, lookup.route, lookup.pathParams));
}

export function createRouter(dependencies: RouterDependencies): Router {
  const routeTable = createRouteTable(dependencies.routes);
  const inFlightChargeKeys = new Set<string>();
  return async (routerRequest) => {
    try {
      return await dispatch({ inFlightChargeKeys, routeTable, dependencies, routerRequest });
    } catch (error: unknown) {
      return toErrorResponse({
        error,
        traceId: routerRequest.traceId,
        reportUnexpectedError: dependencies.reportUnexpectedError,
      });
    }
  };
}
