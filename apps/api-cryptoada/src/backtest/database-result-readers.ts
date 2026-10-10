// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunResultRepository,
  type EquityPointInput,
  type OwnerScope,
  type DatabaseHandle,
  type PositionCursor,
  type PositionInput,
  type ResultPage,
} from '@cryptoada/database';
import type { EquityPointDecision, MetricsClosedPosition } from '@cryptoada/strategy-engine';

import { RESULT_PAGE_SIZE } from './backtest.constant.js';

type PageReader<TItem, TCursor> = (params: {
  readonly limit: number;
  readonly after: TCursor | undefined;
}) => Promise<ResultPage<TItem, TCursor> | undefined>;

// Lê a série inteira por cursor estável: uma consulta por página, sem repetir nem pular linha.
async function readAllPages<TItem, TCursor>(
  read: PageReader<TItem, TCursor>,
): Promise<readonly TItem[]> {
  const items: TItem[] = [];
  let after: TCursor | undefined;
  for (;;) {
    const page = await read({ limit: RESULT_PAGE_SIZE, after });
    if (page === undefined) return items;
    items.push(...page.items);
    if (page.nextCursor === undefined) return items;
    after = page.nextCursor;
  }
}

function toEquityPointDecision(point: EquityPointInput): EquityPointDecision {
  return {
    candleOpenTime: point.candleTime,
    equity: point.equity,
    equityAtLow: point.equityAtLow,
    benchmark: point.benchmark,
  };
}

function toClosedPosition(position: PositionInput): MetricsClosedPosition[] {
  const { exitFee, netProfit, exitReason, closedCandleTime } = position;
  if (exitFee === undefined || netProfit === undefined || exitReason === undefined) return [];
  if (closedCandleTime === undefined) return [];
  return [
    {
      openedCandleOpenTime: position.openedCandleTime,
      candleOpenTime: closedCandleTime,
      entryFee: position.entryFee,
      exitFee,
      netProfit,
      exitReason,
    },
  ];
}

export type ResultReaders = {
  readonly readEquityPoints: () => Promise<readonly EquityPointDecision[]>;
  readonly readClosedPositions: () => Promise<readonly MetricsClosedPosition[]>;
};

export function createResultReaders(params: {
  readonly handle: DatabaseHandle;
  readonly scope: OwnerScope;
  readonly runId: string;
}): ResultReaders {
  const results = createRunResultRepository(params.handle);
  const { scope, runId } = params;
  return {
    readEquityPoints: async (): Promise<readonly EquityPointDecision[]> => {
      const points = await readAllPages<EquityPointInput, number>((page) =>
        results.listEquityPoints(scope, runId, page),
      );
      return points.map(toEquityPointDecision);
    },
    readClosedPositions: async (): Promise<readonly MetricsClosedPosition[]> => {
      const positions = await readAllPages<PositionInput, PositionCursor>((page) =>
        results.listPositions(scope, runId, page),
      );
      return positions
        .flatMap(toClosedPosition)
        .sort((first, second) => first.candleOpenTime - second.candleOpenTime);
    },
  };
}
