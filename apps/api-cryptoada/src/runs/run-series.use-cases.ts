// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  EquityPointInput,
  FillCursor,
  FillInput,
  ListResultsParams,
  OrderCursor,
  OrderInput,
  OwnerScope,
  PositionCursor,
  PositionInput,
  ResultPage,
  RunResultRepository,
  SignalInput,
  WalkForwardWindowInput,
} from '@cryptoada/database';

import type { PageInput, PageOutput } from '../strategies/strategy.use-cases.js';
import { RunNotFoundError } from './run.error.js';
import {
  encodeFillCursor,
  encodeOrderCursor,
  encodePositionCursor,
  encodeTimeCursor,
} from './run-cursor.js';

export type RunSeriesDependencies = {
  readonly results: Pick<
    RunResultRepository,
    | 'listSignals'
    | 'listOrders'
    | 'listFills'
    | 'listPositions'
    | 'listEquityPoints'
    | 'listWindows'
  >;
};

export type RunSeriesUseCase<TItem, TCursor> = (
  scope: OwnerScope,
  runId: string,
  input: PageInput<TCursor>,
) => Promise<PageOutput<TItem>>;

type ListFunction<TItem, TCursor> = (
  scope: OwnerScope,
  runId: string,
  params: ListResultsParams<TCursor>,
) => Promise<ResultPage<TItem, TCursor> | undefined>;

// Uma página do repositório (nunca a série inteira em memória). `undefined` quer dizer execução inexistente OU de outro
// dono: o mesmo `RUN_NOT_FOUND`.
function createSeries<TItem, TCursor>(
  list: ListFunction<TItem, TCursor>,
  encode: (cursor: TCursor) => string,
): RunSeriesUseCase<TItem, TCursor> {
  return async (scope, runId, input) => {
    const page = await list(scope, runId, input);
    if (page === undefined) throw new RunNotFoundError();
    return {
      items: page.items,
      nextCursor: page.nextCursor === undefined ? null : encode(page.nextCursor),
      perPage: input.limit,
    };
  };
}

export type RunSeriesUseCases = {
  readonly equity: RunSeriesUseCase<EquityPointInput, number>;
  readonly trades: RunSeriesUseCase<PositionInput, PositionCursor>;
  readonly signals: RunSeriesUseCase<SignalInput, number>;
  readonly orders: RunSeriesUseCase<OrderInput, OrderCursor>;
  readonly fills: RunSeriesUseCase<FillInput, FillCursor>;
  readonly windows: RunSeriesUseCase<WalkForwardWindowInput, number>;
};

export function createRunSeriesUseCases(dependencies: RunSeriesDependencies): RunSeriesUseCases {
  const { results } = dependencies;
  return {
    equity: createSeries(results.listEquityPoints, encodeTimeCursor),
    trades: createSeries(results.listPositions, encodePositionCursor),
    signals: createSeries(results.listSignals, encodeTimeCursor),
    orders: createSeries(results.listOrders, encodeOrderCursor),
    fills: createSeries(results.listFills, encodeFillCursor),
    windows: createSeries(results.listWindows, encodeTimeCursor),
  };
}
