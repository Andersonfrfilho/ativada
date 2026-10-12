// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RATE_LIMIT_POLICY } from '../rate-limit/rate-limit-policy.constant.js';
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { ProtectedRouteContext, Route } from '../router/route.types.js';
import type { ErrorDetail } from '../shared/errors/app.error.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import { readValidatedBody } from '../shared/http/read-validated-body.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import { RequestValidationError } from '../shared/http/request-validation.error.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readPage } from '../shared/pagination/read-page.js';
import { decodeAssetCursor } from './asset-cursor.js';
import {
  assetSummaryQuerySchema,
  replaceAssetSchema,
  tradeAssetSchema,
  type TradeAssetBody,
} from './asset-requests.js';
import type { GetAssetSummaryUseCase } from './asset-summary.use-case.js';
import {
  ASSET_PATH,
  ASSET_REASON,
  ASSET_SIDE,
  ASSET_SYMBOL_PARAM,
  ASSETS_PATH,
  ASSETS_SUMMARY_PATH,
} from './asset.constant.js';
import { AssetNotFoundError } from './asset.error.js';
import type {
  DeleteAssetUseCase,
  GetAssetUseCase,
  ListAssetsUseCase,
  ReplaceAssetUseCase,
  TradeAssetUseCase,
} from './asset.use-cases.js';
import { ASSET_DOCUMENTATION } from './assets.docs.js';

export type AssetRouteDependencies = {
  readonly enabledSymbols: readonly string[];
  readonly listAssets: ListAssetsUseCase;
  readonly getAssetSummary: GetAssetSummaryUseCase;
  readonly getAsset: GetAssetUseCase;
  readonly replaceAsset: ReplaceAssetUseCase;
  readonly tradeAsset: TradeAssetUseCase;
  readonly deleteAsset: DeleteAssetUseCase;
};

const SYMBOL_PATTERN = /^[A-Z0-9]{2,16}USDT$/;
const NOT_ENABLED_DETAIL: ErrorDetail = {
  field: ASSET_SYMBOL_PARAM,
  reason: ASSET_REASON.NOT_ENABLED,
};

// Par malformado e ativo inexistente são o MESMO 404 (ADR 0001 §e).
function readSymbol(context: ProtectedRouteContext): string {
  const symbol = context.pathParams[ASSET_SYMBOL_PARAM];
  if (symbol === undefined || !SYMBOL_PATTERN.test(symbol)) throw new AssetNotFoundError();
  return symbol;
}

// Cadastrar exige um par que a plataforma acompanha (sem candle não há preço nem regra); ler, vender e apagar, não.
function assertEnabled(dependencies: AssetRouteDependencies, symbol: string): void {
  if (!dependencies.enabledSymbols.includes(symbol)) {
    throw new RequestValidationError([NOT_ENABLED_DETAIL]);
  }
}

function isBuy(body: TradeAssetBody): boolean {
  return body.side === ASSET_SIDE.BUY;
}

function createListRoute(dependencies: AssetRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: ASSETS_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: ASSET_DOCUMENTATION.list,
    handler: async ({ scope, request }): Promise<RouteResult> => {
      const page = await dependencies.listAssets(scope, readPage(request, decodeAssetCursor));
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}

function createSummaryRoute(dependencies: AssetRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: ASSETS_SUMMARY_PATH,
    access: ROUTE_ACCESS.USER,
    rateLimitPolicy: RATE_LIMIT_POLICY.GOAL_EVALUATION,
    documentation: ASSET_DOCUMENTATION.summary,
    handler: async ({ scope, request }): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.getAssetSummary(
        scope,
        readValidatedQuery(request, assetSummaryQuerySchema),
      ),
    }),
  };
}

function createGetRoute(dependencies: AssetRouteDependencies): Route {
  return {
    method: HTTP_METHOD.GET,
    path: ASSET_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: ASSET_DOCUMENTATION.get,
    handler: async (context): Promise<RouteResult> => ({
      status: HTTP_STATUS.OK,
      data: await dependencies.getAsset(context.scope, readSymbol(context)),
    }),
  };
}

function createReplaceRoute(dependencies: AssetRouteDependencies): Route {
  return {
    method: HTTP_METHOD.PUT,
    path: ASSET_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: ASSET_DOCUMENTATION.replace,
    handler: async (context): Promise<RouteResult> => {
      const symbol = readSymbol(context);
      assertEnabled(dependencies, symbol);
      const body = await readValidatedBody(context.request, replaceAssetSchema);
      return {
        status: HTTP_STATUS.OK,
        data: await dependencies.replaceAsset(context.scope, { symbol, body }),
      };
    },
  };
}

function createTradeRoute(dependencies: AssetRouteDependencies): Route {
  return {
    method: HTTP_METHOD.PATCH,
    path: ASSET_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: ASSET_DOCUMENTATION.trade,
    handler: async (context): Promise<RouteResult> => {
      const symbol = readSymbol(context);
      const body = await readValidatedBody(context.request, tradeAssetSchema);
      if (isBuy(body)) assertEnabled(dependencies, symbol);
      return {
        status: HTTP_STATUS.OK,
        data: await dependencies.tradeAsset(context.scope, { symbol, body }),
      };
    },
  };
}

function createDeleteRoute(dependencies: AssetRouteDependencies): Route {
  return {
    method: HTTP_METHOD.DELETE,
    path: ASSET_PATH,
    access: ROUTE_ACCESS.USER,
    documentation: ASSET_DOCUMENTATION.delete,
    handler: async (context): Promise<RouteResult> => {
      await dependencies.deleteAsset(context.scope, readSymbol(context));
      return { status: HTTP_STATUS.NO_CONTENT };
    },
  };
}

export function createAssetRoutes(dependencies: AssetRouteDependencies): readonly Route[] {
  return [
    createListRoute(dependencies),
    createSummaryRoute(dependencies),
    createGetRoute(dependencies),
    createReplaceRoute(dependencies),
    createTradeRoute(dependencies),
    createDeleteRoute(dependencies),
  ];
}
