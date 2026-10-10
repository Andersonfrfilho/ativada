// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunRepository,
  createRunResultRepository,
  type EquityPointInput,
  type FillCursor,
  type FillInput,
  type OrderCursor,
  type OrderInput,
  type OwnerScope,
  type PositionCursor,
  type PositionInput,
  type SignalInput,
} from '../../packages/database/src/index.js';
import { canonicalJson } from '../../packages/strategy-engine/src/index.js';
import { comparableRows } from '../../test/fixtures/backtest/persisted-rows.fixture.js';
import type { ExpectedRows } from '../../test/fixtures/backtest/expected-rows.fixture.js';
import { PAGE_SIZE } from './backtest-test.constant.js';
import type { BacktestTestContext, TestOwner } from './backtest-test-context.js';

type Reader<TItem, TCursor> = (params: {
  readonly limit: number;
  readonly after: TCursor | undefined;
}) => Promise<{ items: readonly TItem[]; nextCursor: TCursor | undefined } | undefined>;

async function readAll<TItem, TCursor>(read: Reader<TItem, TCursor>): Promise<TItem[]> {
  const items: TItem[] = [];
  let after: TCursor | undefined;
  for (;;) {
    const page = await read({ limit: PAGE_SIZE, after });
    if (page === undefined) return items;
    items.push(...page.items);
    if (page.nextCursor === undefined) return items;
    after = page.nextCursor;
  }
}

export type PersistedRun = {
  readonly rows: ExpectedRows;
  readonly counts: Readonly<Record<string, number>>;
  readonly digest: string;
  readonly metrics: unknown;
  readonly engineState: unknown;
  readonly status: string;
  readonly errorCode: string | undefined;
  readonly progress: number;
  readonly lastCandleTime: number | undefined;
};

async function readLists(
  context: BacktestTestContext,
  scope: OwnerScope,
  runId: string,
): Promise<{
  signals: SignalInput[];
  orders: OrderInput[];
  fills: FillInput[];
  positions: PositionInput[];
  equityPoints: EquityPointInput[];
}> {
  const results = createRunResultRepository(context.handle);
  return {
    signals: await readAll<SignalInput, number>((page) => results.listSignals(scope, runId, page)),
    orders: await readAll<OrderInput, OrderCursor>((page) =>
      results.listOrders(scope, runId, page),
    ),
    fills: await readAll<FillInput, FillCursor>((page) => results.listFills(scope, runId, page)),
    positions: await readAll<PositionInput, PositionCursor>((page) =>
      results.listPositions(scope, runId, page),
    ),
    equityPoints: await readAll<EquityPointInput, number>((page) =>
      results.listEquityPoints(scope, runId, page),
    ),
  };
}

// Tudo o que a execução deixou, lido pelos repositórios de produção, e o digest canônico do conjunto.
export async function readPersistedRun(
  context: BacktestTestContext,
  runId: string,
  owner: TestOwner = context.owner,
): Promise<PersistedRun> {
  const runs = createRunRepository(context.handle);
  const run = await runs.findRun(owner.scope, runId);
  const checkpoint = await runs.readCheckpoint(owner.scope, runId);
  if (run === undefined) throw new Error('execução não encontrada');
  const lists = await readLists(context, owner.scope, runId);
  const rows = comparableRows(lists);
  const content = {
    rows,
    metrics: run.metrics ?? null,
    engineState: checkpoint?.engineState ?? null,
    lastCandleTime: run.lastCandleTime ?? null,
    status: run.status,
  };
  return {
    rows,
    counts: {
      signals: lists.signals.length,
      orders: lists.orders.length,
      fills: lists.fills.length,
      positions: lists.positions.length,
      equityPoints: lists.equityPoints.length,
    },
    digest: new Bun.CryptoHasher('sha256').update(canonicalJson(content)).digest('hex'),
    metrics: run.metrics,
    engineState: checkpoint?.engineState,
    status: run.status,
    errorCode: run.errorCode,
    progress: run.progress,
    lastCandleTime: run.lastCandleTime,
  };
}
