// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readPage } from '../shared/pagination/read-page.js';
import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  decodeFillCursor,
  decodeOrderCursor,
  decodePositionCursor,
  decodeTimeCursor,
} from './run-cursor.js';
import { readRunId } from './run-id.js';
import { RUN_SERIES_DOCUMENTATION } from './run-series.docs.js';
import type { RunSeriesUseCase, RunSeriesUseCases } from './run-series.use-cases.js';
import {
  RUN_EQUITY_PATH,
  RUN_FILLS_PATH,
  RUN_ORDERS_PATH,
  RUN_SIGNALS_PATH,
  RUN_TRADES_PATH,
  RUN_WINDOWS_PATH,
} from './runs.constant.js';

type SeriesRouteSpec<TItem, TCursor> = {
  readonly path: string;
  readonly useCase: RunSeriesUseCase<TItem, TCursor>;
  readonly decode: (text: string) => TCursor | undefined;
  readonly documentation: RouteDocumentation;
};

function createSeriesRoute<TItem, TCursor>(spec: SeriesRouteSpec<TItem, TCursor>): Route {
  return {
    method: HTTP_METHOD.GET,
    path: spec.path,
    access: ROUTE_ACCESS.USER,
    documentation: spec.documentation,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const page = await spec.useCase(context.scope, runId, readPage(context.request, spec.decode));
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}

export function createRunSeriesRoutes(series: RunSeriesUseCases): readonly Route[] {
  return [
    createSeriesRoute({
      path: RUN_EQUITY_PATH,
      useCase: series.equity,
      decode: decodeTimeCursor,
      documentation: RUN_SERIES_DOCUMENTATION.equity,
    }),
    createSeriesRoute({
      path: RUN_TRADES_PATH,
      useCase: series.trades,
      decode: decodePositionCursor,
      documentation: RUN_SERIES_DOCUMENTATION.trades,
    }),
    createSeriesRoute({
      path: RUN_SIGNALS_PATH,
      useCase: series.signals,
      decode: decodeTimeCursor,
      documentation: RUN_SERIES_DOCUMENTATION.signals,
    }),
    createSeriesRoute({
      path: RUN_ORDERS_PATH,
      useCase: series.orders,
      decode: decodeOrderCursor,
      documentation: RUN_SERIES_DOCUMENTATION.orders,
    }),
    createSeriesRoute({
      path: RUN_FILLS_PATH,
      useCase: series.fills,
      decode: decodeFillCursor,
      documentation: RUN_SERIES_DOCUMENTATION.fills,
    }),
    createSeriesRoute({
      path: RUN_WINDOWS_PATH,
      useCase: series.windows,
      decode: decodeTimeCursor,
      documentation: RUN_SERIES_DOCUMENTATION.windows,
    }),
  ];
}
