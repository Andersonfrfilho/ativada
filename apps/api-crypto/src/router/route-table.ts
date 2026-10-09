// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RouteDeclarationError } from './route-declaration.error.js';
import { ADMIN_PATH_PREFIX, ROUTE_ACCESS } from './route-access.constant.js';
import type { Route } from './route.types.js';

export const ROUTE_LOOKUP_KIND = {
  FOUND: 'found',
  METHOD_NOT_ALLOWED: 'method-not-allowed',
  NOT_FOUND: 'not-found',
} as const;

export type RouteLookup =
  | { readonly kind: typeof ROUTE_LOOKUP_KIND.FOUND; readonly route: Route }
  | {
      readonly kind: typeof ROUTE_LOOKUP_KIND.METHOD_NOT_ALLOWED;
      readonly allowedMethods: readonly string[];
    }
  | { readonly kind: typeof ROUTE_LOOKUP_KIND.NOT_FOUND };

export type RouteTable = {
  readonly routes: readonly Route[];
  readonly find: (method: string, path: string) => RouteLookup;
};

const DECLARED_ACCESS_VALUES: readonly string[] = Object.values(ROUTE_ACCESS);

function describeRoute(route: Route): string {
  return `${route.method} ${route.path}`;
}

function assertRouteDeclaration(route: Route): void {
  const declaredAccess: unknown = route.access;
  if (typeof declaredAccess !== 'string' || !DECLARED_ACCESS_VALUES.includes(declaredAccess)) {
    throw new RouteDeclarationError(`${describeRoute(route)} não declara access`);
  }
  const isAdminPath = route.path.startsWith(ADMIN_PATH_PREFIX);
  if (isAdminPath && route.access !== ROUTE_ACCESS.ADMIN) {
    throw new RouteDeclarationError(
      `${describeRoute(route)} está em /v1/admin e exige access admin`,
    );
  }
}

export function createRouteTable(routes: readonly Route[]): RouteTable {
  const routesByPath = new Map<string, Map<string, Route>>();
  for (const route of routes) {
    assertRouteDeclaration(route);
    const routesByMethod = routesByPath.get(route.path) ?? new Map<string, Route>();
    if (routesByMethod.has(route.method)) {
      throw new RouteDeclarationError(`${describeRoute(route)} declarada duas vezes`);
    }
    routesByMethod.set(route.method, route);
    routesByPath.set(route.path, routesByMethod);
  }

  function find(method: string, path: string): RouteLookup {
    const routesByMethod = routesByPath.get(path);
    if (routesByMethod === undefined) return { kind: ROUTE_LOOKUP_KIND.NOT_FOUND };
    const route = routesByMethod.get(method);
    if (route === undefined) {
      return {
        kind: ROUTE_LOOKUP_KIND.METHOD_NOT_ALLOWED,
        allowedMethods: [...routesByMethod.keys()],
      };
    }
    return { kind: ROUTE_LOOKUP_KIND.FOUND, route };
  }

  return { routes, find };
}
