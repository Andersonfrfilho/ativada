// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createAccountRoutes, type AccountRouteDependencies } from '../account/account.routes.js';
import { createAdminRoutes, type AdminRouteDependencies } from '../admin/admin.routes.js';
import { createProfileRoutes, type ProfileRouteDependencies } from '../profile/profile.routes.js';
import type { Route } from '../router/route.types.js';
import { createSessionRoutes, type SessionRouteDependencies } from '../session/session.routes.js';
import {
  createTelegramRoutes,
  type TelegramRouteDependencies,
} from '../telegram/telegram.routes.js';
import type { StreamTicketStore } from '../stream/stream-ticket-store.js';
import { createStreamTicketRoutes } from '../stream/stream-ticket.routes.js';
import { createHealthRoutes, type HealthRouteDependencies } from './health.routes.js';

export type ApiRouteDependencies = HealthRouteDependencies & {
  readonly session: SessionRouteDependencies;
  readonly account: AccountRouteDependencies;
  readonly profile: ProfileRouteDependencies;
  readonly telegram: TelegramRouteDependencies;
  readonly admin: AdminRouteDependencies;
  readonly streamTicketStore: StreamTicketStore;
};

export function createApiRoutes(dependencies: ApiRouteDependencies): readonly Route[] {
  return [
    ...createHealthRoutes(dependencies),
    ...createSessionRoutes(dependencies.session),
    ...createProfileRoutes(dependencies.profile),
    ...createAccountRoutes(dependencies.account),
    ...createTelegramRoutes(dependencies.telegram),
    ...createAdminRoutes(dependencies.admin),
    ...createStreamTicketRoutes(dependencies.streamTicketStore),
  ];
}
