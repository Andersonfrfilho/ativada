// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunResultRows } from '../../../packages/database/src/index.js';
import type { StoredResults } from './in-memory-backtest-types.fixture.js';

export function createEmptyResults(): StoredResults {
  return {
    signals: new Map(),
    orders: new Map(),
    fills: new Map(),
    positions: new Map(),
    equityPoints: new Map(),
    commands: new Map(),
  };
}

export function cloneResults(results: StoredResults): StoredResults {
  return {
    signals: new Map(results.signals),
    orders: new Map(results.orders),
    fills: new Map(results.fills),
    positions: new Map(results.positions),
    equityPoints: new Map(results.equityPoints),
    commands: new Map(results.commands),
  };
}

function definedFields<TRow extends object>(row: TRow): Partial<TRow> {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined),
  ) as Partial<TRow>;
}

// Espelha o repositório de verdade: imutável por chave natural; ordem e posição avançam por status.
function upsertMonotonic<TRow extends { readonly status: string }>(params: {
  readonly map: Map<string, TRow>;
  readonly key: string;
  readonly row: TRow;
  readonly initialStatus: string;
}): void {
  const { map, key, row, initialStatus } = params;
  const current = map.get(key);
  const rank = (status: string): number => (status === initialStatus ? 0 : 1);
  if (current === undefined) {
    map.set(key, row);
    return;
  }
  if (rank(row.status) > rank(current.status)) {
    map.set(key, { ...current, ...definedFields(row) });
  }
}

export function appendRows(target: StoredResults, rows: RunResultRows): number {
  for (const row of rows.signals) {
    if (!target.signals.has(row.candleTime)) target.signals.set(row.candleTime, row);
  }
  for (const row of rows.orders) {
    upsertMonotonic({ map: target.orders, key: row.engineKey, row, initialStatus: 'created' });
  }
  for (const row of rows.positions) {
    upsertMonotonic({ map: target.positions, key: row.engineKey, row, initialStatus: 'open' });
  }
  for (const row of rows.fills) {
    const key = `${row.orderKey}|${row.candleTime}`;
    if (!target.fills.has(key)) target.fills.set(key, row);
  }
  for (const row of rows.equityPoints) {
    if (!target.equityPoints.has(row.candleTime)) target.equityPoints.set(row.candleTime, row);
  }
  for (const row of rows.commands) {
    if (!target.commands.has(row.commandId)) target.commands.set(row.commandId, row);
  }
  return (
    rows.signals.length +
    rows.orders.length +
    rows.fills.length +
    rows.positions.length +
    rows.equityPoints.length +
    rows.commands.length
  );
}

// Contagem e conteúdo em ordem canônica: dois bancos que gravaram o mesmo têm o mesmo instantâneo.
export function snapshotResults(results: StoredResults): Record<string, readonly unknown[]> {
  const sorted = <TKey extends string | number, TRow>(map: Map<TKey, TRow>): TRow[] =>
    [...map.entries()].sort(([first], [second]) => (first < second ? -1 : 1)).map(([, row]) => row);
  return {
    signals: sorted(results.signals),
    orders: sorted(results.orders),
    fills: sorted(results.fills),
    positions: sorted(results.positions),
    equityPoints: sorted(results.equityPoints),
    commands: sorted(results.commands),
  };
}
