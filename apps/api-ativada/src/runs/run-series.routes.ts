// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { ROUTE_ACCESS } from '../router/route-access.constant.js';
import type { Route } from '../router/route.types.js';
import { HTTP_METHOD, HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteResult } from '../shared/http/response-envelope.js';
import { readValidatedQuery } from '../shared/http/read-validated-query.js';
import { invalidCursorError } from '../shared/pagination/page-query.schema.js';
import { DEFAULT_PAGE_SIZE } from '../shared/pagination/pagination.constant.js';
import { readPage } from '../shared/pagination/read-page.js';
import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { decodeFillCursor, decodeOrderCursor, decodeTimeCursor } from './run-cursor.js';
import { readRunId } from './run-id.js';
import { createRunTradesRoute } from './trades/run-trades.route.js';
import { ORDERABLE_QUERY_SHAPE, RUN_SERIES_DOCUMENTATION } from './run-series.docs.js';
import type {
  RunSeriesUseCase,
  RunSeriesUseCases,
  SeriesPageInput,
} from './run-series.use-cases.js';
import {
  RUN_EQUITY_PATH,
  RUN_FILLS_PATH,
  RUN_ORDERS_PATH,
  RUN_SIGNALS_PATH,
  RUN_WINDOWS_PATH,
} from './runs.constant.js';

type SeriesRouteSpec<TItem, TCursor> = {
  readonly path: string;
  readonly useCase: RunSeriesUseCase<TItem, TCursor>;
  readonly decode: (text: string) => TCursor | undefined;
  readonly documentation: RouteDocumentation;
  readonly isOrderable?: boolean;
};

const orderableQuerySchema = z.strictObject(ORDERABLE_QUERY_SHAPE);

// Só a curva de patrimônio e os sinais aceitam `order`; nas demais séries o parâmetro continua sendo 400.
function readSeriesPage<TItem, TCursor>(
  request: Request,
  spec: SeriesRouteSpec<TItem, TCursor>,
): SeriesPageInput<TCursor> {
  if (spec.isOrderable !== true) return readPage(request, spec.decode);
  const query = readValidatedQuery(request, orderableQuerySchema);
  const after = query.cursor === undefined ? undefined : spec.decode(query.cursor);
  if (query.cursor !== undefined && after === undefined) throw invalidCursorError();
  return {
    limit: query.limit ?? DEFAULT_PAGE_SIZE,
    after,
    ...(query.order === undefined ? {} : { order: query.order }),
  };
}

function createSeriesRoute<TItem, TCursor>(spec: SeriesRouteSpec<TItem, TCursor>): Route {
  return {
    method: HTTP_METHOD.GET,
    path: spec.path,
    access: ROUTE_ACCESS.USER,
    documentation: spec.documentation,
    handler: async (context): Promise<RouteResult> => {
      const runId = readRunId(context);
      const page = await spec.useCase(context.scope, runId, readSeriesPage(context.request, spec));
      return {
        status: HTTP_STATUS.OK,
        data: page.items,
        pagination: { nextCursor: page.nextCursor, perPage: page.perPage },
      };
    },
  };
}

// Patrimônio e sinais aceitam `order=desc` (o painel lê o ponto mais recente sem varrer a série).
function createOrderableRoutes(series: RunSeriesUseCases): readonly Route[] {
  return [
    createSeriesRoute({
      path: RUN_EQUITY_PATH,
      useCase: series.equity,
      decode: decodeTimeCursor,
      documentation: RUN_SERIES_DOCUMENTATION.equity,
      isOrderable: true,
    }),
    createSeriesRoute({
      path: RUN_SIGNALS_PATH,
      useCase: series.signals,
      decode: decodeTimeCursor,
      documentation: RUN_SERIES_DOCUMENTATION.signals,
      isOrderable: true,
    }),
  ];
}

export function createRunSeriesRoutes(series: RunSeriesUseCases): readonly Route[] {
  return [
    ...createOrderableRoutes(series),
    createRunTradesRoute(series.trades),
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
