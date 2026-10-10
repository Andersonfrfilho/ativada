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
  type WalkForwardWindowInput,
} from '../../packages/database/src/index.js';
import { canonicalJson } from '../../packages/strategy-engine/src/index.js';
import { PAGE_SIZE } from './walkforward-test.constant.js';
import type { WalkForwardTestContext } from './walkforward-test-context.js';

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

export type PersistedWalkForward = {
  readonly status: string;
  readonly errorCode: string | undefined;
  readonly progress: number;
  readonly metrics: unknown;
  readonly windows: readonly WalkForwardWindowInput[];
  readonly equityPoints: readonly EquityPointInput[];
  readonly counts: Readonly<Record<string, number>>;
  readonly digest: string;
};

export async function readPersisted(
  context: WalkForwardTestContext,
  runId: string,
  scope: OwnerScope = context.owner.scope,
): Promise<PersistedWalkForward> {
  const results = createRunResultRepository(context.handle);
  const run = await createRunRepository(context.handle).findRun(scope, runId);
  if (run === undefined) throw new Error('execução não encontrada para este dono');
  const windows = await readAll<WalkForwardWindowInput, number>((page) =>
    results.listWindows(scope, runId, page),
  );
  const equityPoints = await readAll<EquityPointInput, number>((page) =>
    results.listEquityPoints(scope, runId, page),
  );
  const signals = await readAll<SignalInput, number>((page) =>
    results.listSignals(scope, runId, page),
  );
  const orders = await readAll<OrderInput, OrderCursor>((page) =>
    results.listOrders(scope, runId, page),
  );
  const fills = await readAll<FillInput, FillCursor>((page) =>
    results.listFills(scope, runId, page),
  );
  const positions = await readAll<PositionInput, PositionCursor>((page) =>
    results.listPositions(scope, runId, page),
  );
  const digest = new Bun.CryptoHasher('sha256')
    .update(
      canonicalJson(
        JSON.parse(
          JSON.stringify({
            windows,
            equityPoints,
            signals,
            orders,
            fills,
            positions,
            metrics: run.metrics,
          }),
        ),
      ),
    )
    .digest('hex')
    .slice(0, 16);
  return {
    status: run.status,
    errorCode: run.errorCode,
    progress: run.progress,
    metrics: run.metrics,
    windows,
    equityPoints,
    counts: {
      windows: windows.length,
      equityPoints: equityPoints.length,
      signals: signals.length,
      orders: orders.length,
      fills: fills.length,
      positions: positions.length,
    },
    digest,
  };
}
