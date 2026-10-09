// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Route } from '../router/route.types.js';
import { createHealthRoutes, type HealthRouteDependencies } from './health.routes.js';

export type ApiRouteDependencies = HealthRouteDependencies;

export function createApiRoutes(dependencies: ApiRouteDependencies): readonly Route[] {
  return [...createHealthRoutes(dependencies)];
}
