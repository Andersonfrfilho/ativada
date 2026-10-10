// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_CHARGE, RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ME_PATH } from '../profile/profile.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_HEADER, HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { EXPORT_FILE_NAME_PREFIX, ISO_DATE_LENGTH, ME_EXPORT_PATH } from './account.constant.js';
import type { DeleteAccountUseCase } from './delete-account.use-case.js';
import type { AccountExportDocument, ExportAccountUseCase } from './export-account.use-case.js';

export type AccountRouteDependencies = {
  readonly exportAccount: ExportAccountUseCase;
  readonly deleteAccount: DeleteAccountUseCase;
};

function buildAttachmentHeader(document: AccountExportDocument): string {
  const day = document.exportedAt.slice(0, ISO_DATE_LENGTH);
  return `attachment; filename="${EXPORT_FILE_NAME_PREFIX}-${day}.json"`;
}

export function createAccountRoutes(dependencies: AccountRouteDependencies): readonly Route[] {
  return [
    {
      method: HTTP_METHOD.GET,
      path: ME_EXPORT_PATH,
      access: ROUTE_ACCESS.USER,
      rateLimitPolicy: RATE_LIMIT_POLICY.ACCOUNT_EXPORT,
      rateLimitCharge: RATE_LIMIT_CHARGE.AFTER_SUCCESS,
      handler: async ({ scope, authenticatedUser }): Promise<RouteResult> => {
        const document = await dependencies.exportAccount({
          scope,
          keycloakSubject: authenticatedUser.keycloakSubject,
        });
        return {
          status: HTTP_STATUS.OK,
          data: document,
          headers: { [HTTP_HEADER.CONTENT_DISPOSITION]: buildAttachmentHeader(document) },
        };
      },
    },
    {
      method: HTTP_METHOD.DELETE,
      path: ME_PATH,
      access: ROUTE_ACCESS.USER,
      handler: async (context): Promise<RouteResult> => ({
        status: HTTP_STATUS.ACCEPTED,
        data: await dependencies.deleteAccount({
          authenticatedUser: context.authenticatedUser,
          scope: context.scope,
          authenticationTime: context.authenticationTime,
          clientAddress: context.clientAddress,
        }),
      }),
    },
  ];
}
