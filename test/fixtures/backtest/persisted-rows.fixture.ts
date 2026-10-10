// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { InMemoryBacktest } from './in-memory-backtest-database.fixture.js';
import type { ExpectedRows } from './expected-rows.fixture.js';

// O que ficou GRAVADO, no mesmo formato de `expectedRowsOf`.
export function persistedRowsOf(memory: InMemoryBacktest): ExpectedRows {
  const { results } = memory.state;
  const bySort = <TRow>(rows: Iterable<TRow>, key: (row: TRow) => string | number): TRow[] =>
    [...rows].sort((first, second) => (key(first) < key(second) ? -1 : 1));
  return {
    equityPoints: bySort(results.equityPoints.values(), (row) => row.candleTime),
    signals: bySort(results.signals.values(), (row) => row.candleTime).map((row) => ({
      candleTime: row.candleTime,
      action: row.action,
      score: row.score,
      regime: row.regime,
      reason: row.reason,
    })),
    fills: bySort(results.fills.values(), (row) => `${row.candleTime}|${row.orderKey}`),
    closedPositions: bySort(
      [...results.positions.values()].filter((row) => row.status === 'closed'),
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
    orderStatuses: Object.fromEntries(
      [...results.orders.values()].map((row) => [row.engineKey, row.status]),
    ),
  };
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
