// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RouteDeclarationError } from './route-declaration.error.js';
import { ADMIN_PATH_PREFIX, ROUTE_ACCESS } from './route-access.constant.js';
import type { Route } from './route.types.js';

export const ROUTE_LOOKUP_KIND = {
  FOUND: 'found',
  METHOD_NOT_ALLOWED: 'method-not-allowed',
  NOT_FOUND: 'not-found',
} as const;

export type PathParams = Readonly<Record<string, string>>;

export type RouteLookup =
  | {
      readonly kind: typeof ROUTE_LOOKUP_KIND.FOUND;
      readonly route: Route;
      readonly pathParams: PathParams;
    }
  | {
      readonly kind: typeof ROUTE_LOOKUP_KIND.METHOD_NOT_ALLOWED;
      readonly allowedMethods: readonly string[];
    }
  | { readonly kind: typeof ROUTE_LOOKUP_KIND.NOT_FOUND };

export type RouteTable = {
  readonly routes: readonly Route[];
  readonly find: (method: string, path: string) => RouteLookup;
};

const PATH_PARAM_PREFIX = ':';
const NO_PATH_PARAMS: PathParams = Object.freeze({});

type PatternRoute = {
  readonly segments: readonly string[];
  readonly route: Route;
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

function splitPath(path: string): readonly string[] {
  return path.split('/').slice(1);
}

function matchPattern(
  segments: readonly string[],
  pathSegments: readonly string[],
): PathParams | undefined {
  if (segments.length !== pathSegments.length) return undefined;
  const pathParams: Record<string, string> = {};
  for (const [index, segment] of segments.entries()) {
    const pathSegment = pathSegments[index] ?? '';
    if (!segment.startsWith(PATH_PARAM_PREFIX)) {
      if (segment !== pathSegment) return undefined;
      continue;
    }
    if (pathSegment.length === 0) return undefined;
    pathParams[segment.slice(PATH_PARAM_PREFIX.length)] = pathSegment;
  }
  return pathParams;
}

function isPattern(path: string): boolean {
  return path.includes(`/${PATH_PARAM_PREFIX}`);
}

type RouteIndex = {
  readonly routesByPath: Map<string, Map<string, Route>>;
  readonly patternRoutes: PatternRoute[];
};

function duplicateRouteError(route: Route): RouteDeclarationError {
  return new RouteDeclarationError(`${describeRoute(route)} declarada duas vezes`);
}

function addPatternRoute(index: RouteIndex, route: Route): void {
  const isDuplicate = index.patternRoutes.some(
    (entry) => entry.route.method === route.method && entry.route.path === route.path,
  );
  if (isDuplicate) throw duplicateRouteError(route);
  index.patternRoutes.push({ segments: splitPath(route.path), route });
}

function addExactRoute(index: RouteIndex, route: Route): void {
  const routesByMethod = index.routesByPath.get(route.path) ?? new Map<string, Route>();
  if (routesByMethod.has(route.method)) throw duplicateRouteError(route);
  routesByMethod.set(route.method, route);
  index.routesByPath.set(route.path, routesByMethod);
}

function buildRouteIndex(routes: readonly Route[]): RouteIndex {
  const index: RouteIndex = { routesByPath: new Map(), patternRoutes: [] };
  for (const route of routes) {
    assertRouteDeclaration(route);
    if (isPattern(route.path)) addPatternRoute(index, route);
    else addExactRoute(index, route);
  }
  return index;
}

function findPattern(index: RouteIndex, method: string, path: string): RouteLookup {
  const pathSegments = splitPath(path);
  const allowedMethods: string[] = [];
  for (const entry of index.patternRoutes) {
    const pathParams = matchPattern(entry.segments, pathSegments);
    if (pathParams === undefined) continue;
    if (entry.route.method === method) {
      return { kind: ROUTE_LOOKUP_KIND.FOUND, route: entry.route, pathParams };
    }
    allowedMethods.push(entry.route.method);
  }
  if (allowedMethods.length === 0) return { kind: ROUTE_LOOKUP_KIND.NOT_FOUND };
  return { kind: ROUTE_LOOKUP_KIND.METHOD_NOT_ALLOWED, allowedMethods };
}

function findRoute(index: RouteIndex, method: string, path: string): RouteLookup {
  const routesByMethod = index.routesByPath.get(path);
  if (routesByMethod === undefined) return findPattern(index, method, path);
  const route = routesByMethod.get(method);
  if (route === undefined) {
    return {
      kind: ROUTE_LOOKUP_KIND.METHOD_NOT_ALLOWED,
      allowedMethods: [...routesByMethod.keys()],
    };
  }
  return { kind: ROUTE_LOOKUP_KIND.FOUND, route, pathParams: NO_PATH_PARAMS };
}

export function createRouteTable(routes: readonly Route[]): RouteTable {
  const index = buildRouteIndex(routes);
  return { routes, find: (method, path) => findRoute(index, method, path) };
}
