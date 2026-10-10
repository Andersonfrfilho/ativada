// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { ProtectedRouteContext, Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import type { AdminActor } from './admin-actor.js';
import {
  ACCOUNT_BLOCK_PATH,
  ACCOUNT_ID_PARAM,
  ACCOUNT_UNBLOCK_PATH,
  ACCOUNTS_PATH,
  INVITATIONS_PATH,
} from './admin.constant.js';
import { inviteUserSchema, readAccountId, readListAccountsQuery } from './admin-requests.js';
import type { AccountStateUseCase } from './block-account.use-case.js';
import type { InviteUserUseCase } from './invite-user.use-case.js';
import type { ListAccountsUseCase } from './list-accounts.use-case.js';

export type AdminRouteDependencies = {
  readonly inviteUser: InviteUserUseCase;
  readonly listAccounts: ListAccountsUseCase;
  readonly blockAccount: AccountStateUseCase;
  readonly unblockAccount: AccountStateUseCase;
};

function toActor(context: ProtectedRouteContext): AdminActor {
  return { userId: context.authenticatedUser.userId, clientAddress: context.clientAddress };
}

function createAccountStateRoute(path: string, useCase: AccountStateUseCase): Route {
  return {
    method: HTTP_METHOD.POST,
    path,
    access: ROUTE_ACCESS.ADMIN,
    handler: async (context): Promise<RouteResult> => {
      const accountId = readAccountId(context.pathParams[ACCOUNT_ID_PARAM]);
      const result = await useCase({ accountId, actor: toActor(context) });
      const status = result.isIdentityProviderSynced ? HTTP_STATUS.OK : HTTP_STATUS.ACCEPTED;
      return { status, data: result };
    },
  };
}

export function createAdminRoutes(dependencies: AdminRouteDependencies): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.POST,
      path: INVITATIONS_PATH,
      access: ROUTE_ACCESS.ADMIN,
      rateLimitPolicy: RATE_LIMIT_POLICY.ADMIN_INVITATION,
      handler: async (context): Promise<RouteResult> => {
        const { email } = await readValidatedBody(context.request, inviteUserSchema);
        const result = await dependencies.inviteUser({ email, actor: toActor(context) });
        return { status: HTTP_STATUS.CREATED, data: result };
      },
    },
    {
      method: HTTP_METHOD.GET,
      path: ACCOUNTS_PATH,
      access: ROUTE_ACCESS.ADMIN,
      handler: async ({ request }): Promise<RouteResult> => {
        const { items, nextCursor, perPage } = await dependencies.listAccounts(
          readListAccountsQuery(request),
        );
        return { status: HTTP_STATUS.OK, data: items, pagination: { nextCursor, perPage } };
      },
    },
    createAccountStateRoute(ACCOUNT_BLOCK_PATH, dependencies.blockAccount),
    createAccountStateRoute(ACCOUNT_UNBLOCK_PATH, dependencies.unblockAccount),
  ];
}
