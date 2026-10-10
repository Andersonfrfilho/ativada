// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  EquityPointInput,
  FillInput,
  OrderInput,
  PositionInput,
  SignalInput,
} from '../../../packages/database/src/index.js';
import type { InMemoryBacktest } from './in-memory-backtest-database.fixture.js';
import type { ExpectedRows } from './expected-rows.fixture.js';

// As linhas gravadas, em qualquer forma que as entregue (mapas da memória ou páginas do repositório).
export type RowLists = {
  readonly signals: Iterable<SignalInput>;
  readonly orders: Iterable<OrderInput>;
  readonly fills: Iterable<FillInput>;
  readonly positions: Iterable<PositionInput>;
  readonly equityPoints: Iterable<EquityPointInput>;
};

// O que ficou GRAVADO, no mesmo formato de `expectedRowsOf`.
export function comparableRows(lists: RowLists): ExpectedRows {
  const bySort = <TRow>(rows: Iterable<TRow>, key: (row: TRow) => string | number): TRow[] =>
    [...rows].sort((first, second) => (key(first) < key(second) ? -1 : 1));
  return {
    equityPoints: bySort(lists.equityPoints, (row) => row.candleTime).map((row) => ({
      candleTime: row.candleTime,
      equity: row.equity,
      equityAtLow: row.equityAtLow,
      benchmark: row.benchmark,
    })),
    signals: bySort(lists.signals, (row) => row.candleTime).map((row) => ({
      candleTime: row.candleTime,
      action: row.action,
      score: row.score,
      regime: row.regime,
      reason: row.reason,
    })),
    fills: bySort(lists.fills, (row) => `${row.candleTime}|${row.orderKey}`).map((row) => ({
      orderKey: row.orderKey,
      positionKey: row.positionKey,
      candleTime: row.candleTime,
      side: row.side,
      price: row.price,
      quantity: row.quantity,
      notional: row.notional,
      fee: row.fee,
    })),
    closedPositions: bySort(
      [...lists.positions].filter((row) => row.status === 'closed'),
      (row) => row.closedCandleTime ?? 0,
    ).map((row) => ({
      engineKey: row.engineKey,
      entryPrice: row.entryPrice,
      exitPrice: row.exitPrice,
      quantity: row.quantity,
      netProfit: row.netProfit,
      exitReason: row.exitReason,
      openedCandleTime: row.openedCandleTime,
      closedCandleTime: row.closedCandleTime,
      stopPrice: row.stopPrice,
      targetPrice: row.targetPrice,
    })),
    orderStatuses: Object.fromEntries([...lists.orders].map((row) => [row.engineKey, row.status])),
  };
}

export function persistedRowsOf(memory: InMemoryBacktest): ExpectedRows {
  const { results } = memory.state;
  return comparableRows({
    signals: results.signals.values(),
    orders: results.orders.values(),
    fills: results.fills.values(),
    positions: results.positions.values(),
    equityPoints: results.equityPoints.values(),
  });
}

// As listas de comparação saem na mesma ordem: por candle e, no mesmo candle, pela chave da ordem.
export function sortedLikePersisted(rows: ExpectedRows): ExpectedRows {
  const sortFills = (fills: readonly unknown[]): unknown[] =>
    [...fills].sort((first, second) => {
      const a = first as { candleTime: number; orderKey: string };
      const b = second as { candleTime: number; orderKey: string };
      return `${a.candleTime}|${a.orderKey}` < `${b.candleTime}|${b.orderKey}` ? -1 : 1;
    });
  return { ...rows, fills: sortFills(rows.fills) };
}
