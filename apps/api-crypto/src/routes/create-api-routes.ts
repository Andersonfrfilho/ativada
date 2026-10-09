// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createProfileRoutes, type ProfileRouteDependencies } from '../profile/profile.routes.js';
import type { Route } from '../router/route.types.js';
import { createSessionRoutes, type SessionRouteDependencies } from '../session/session.routes.js';
import type { StreamTicketStore } from '../stream/stream-ticket-store.js';
import { createStreamTicketRoutes } from '../stream/stream-ticket.routes.js';
import { createHealthRoutes, type HealthRouteDependencies } from './health.routes.js';

export type ApiRouteDependencies = HealthRouteDependencies & {
  readonly session: SessionRouteDependencies;
  readonly profile: ProfileRouteDependencies;
  readonly streamTicketStore: StreamTicketStore;
};

export function createApiRoutes(dependencies: ApiRouteDependencies): readonly Route[] {
  return [
    ...createHealthRoutes(dependencies),
    ...createSessionRoutes(dependencies.session),
    ...createProfileRoutes(dependencies.profile),
    ...createStreamTicketRoutes(dependencies.streamTicketStore),
  ];
}
