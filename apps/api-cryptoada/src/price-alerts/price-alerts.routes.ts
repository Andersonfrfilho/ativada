// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { ProtectedRouteContext, Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import { parseResourceId } from '../shared/http/resource-id.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readPage } from '../shared/pagination/read-page.js';
import { decodePriceAlertCursor } from './price-alert-cursor.js';
import { createPriceAlertSchema, patchPriceAlertSchema } from './price-alert-requests.js';
import {
  PRICE_ALERT_ID_PARAM,
  PRICE_ALERT_PATH,
  PRICE_ALERTS_FIRED_PATH,
  PRICE_ALERTS_PATH,
} from './price-alert.constant.js';
import { PriceAlertNotFoundError } from './price-alert.error.js';
import type {
  ClearFiredPriceAlertsUseCase,
  CreatePriceAlertUseCase,
  DeletePriceAlertUseCase,
  GetPriceAlertUseCase,
  ListPriceAlertsUseCase,
  UpdatePriceAlertUseCase,
} from './price-alert.use-cases.js';
import { PRICE_ALERT_DOCUMENTATION } from './price-alerts.docs.js';

export type PriceAlertRouteDependencies = {
  readonly enabledSymbols: readonly string[];
  readonly createPriceAlert: CreatePriceAlertUseCase;
  readonly listPriceAlerts: ListPriceAlertsUseCase;
  readonly getPriceAlert: GetPriceAlertUseCase;
  readonly updatePriceAlert: UpdatePriceAlertUseCase;
  readonly deletePriceAlert: DeletePriceAlertUseCase;
  readonly clearFiredPriceAlerts: ClearFiredPriceAlertsUseCase;
};

// UUID malformado e alerta inexistente são o MESMO 404 (ADR 0001 §e).
function readAlertId(context: ProtectedRouteContext): string {
  const alertId = parseResourceId(context.pathParams[PRICE_ALERT_ID_PARAM]);
  if (alertId === undefined) throw new PriceAlertNotFoundError();
  return alertId;
}

function createListRoute(dependencies: PriceAlertRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: PRICE_ALERTS_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: PRICE_ALERT_DOCUMENTATION.list,
    handler: async ({ scope, request }): Promise<RouteResult> => {
      const page = await dependencies.listPriceAlerts(
        scope,
        readPage(request, decodePriceAlertCursor),
      );
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}

function createCreateRoute(dependencies: PriceAlertRouteDependencies): Route {
  const schema = createPriceAlertSchema(dependencies.enabledSymbols);
  return {
    method: HTTP_METHOD.POST,
    path: PRICE_ALERTS_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.PRICE_ALERT_MUTATION,
    documentation: PRICE_ALERT_DOCUMENTATION.create,
    handler: async ({ scope, request }): Promise<RouteResult> => ({
      status: HTTP_STATUS.CREATED,
      data: await dependencies.createPriceAlert(scope, await readValidatedBody(request, schema)),
    }),
  };
}

function createGetRoute(dependencies: PriceAlertRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: PRICE_ALERT_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: PRICE_ALERT_DOCUMENTATION.get,
    handler: async (context): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.getPriceAlert(context.scope, readAlertId(context)),
    }),
  };
}

function createUpdateRoute(dependencies: PriceAlertRouteDependencies): Route {
  return {
    method: HTTP_METHOD.PATCH,
    path: PRICE_ALERT_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.PRICE_ALERT_MUTATION,
    documentation: PRICE_ALERT_DOCUMENTATION.update,
    handler: async (context): Promise<RouteResult> => {
      const alertId = readAlertId(context);
      const patch = await readValidatedBody(context.request, patchPriceAlertSchema);
      return {
        status: HTTP_STATUS.OK,
        data: await dependencies.updatePriceAlert(context.scope, { alertId, patch }),
      };
    },
  };
}

function createDeleteRoute(dependencies: PriceAlertRouteDependencies): Route {
  return {
    method: HTTP_METHOD.DELETE,
    path: PRICE_ALERT_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.PRICE_ALERT_MUTATION,
    documentation: PRICE_ALERT_DOCUMENTATION.delete,
    handler: async (context): Promise<RouteResult> => {
      await dependencies.deletePriceAlert(context.scope, readAlertId(context));
      return { status: HTTP_STATUS.NO_CONTENT };
    },
  };
}

function createClearFiredRoute(dependencies: PriceAlertRouteDependencies): Route {
  return {
    method: HTTP_METHOD.DELETE,
    path: PRICE_ALERTS_FIRED_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.PRICE_ALERT_MUTATION,
    documentation: PRICE_ALERT_DOCUMENTATION.clearFired,
    handler: async ({ scope }): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.clearFiredPriceAlerts(scope),
    }),
  };
}

export function createPriceAlertRoutes(
  dependencies: PriceAlertRouteDependencies,
): readonly Route[] {
  return [
    createListRoute(dependencies),
    createCreateRoute(dependencies),
    createGetRoute(dependencies),
    createUpdateRoute(dependencies),
    createClearFiredRoute(dependencies),
    createDeleteRoute(dependencies),
  ];
}
