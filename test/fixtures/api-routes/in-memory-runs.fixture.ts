// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CandleRecord,
  CandleRepository,
  CreateRunParams,
  EquityPointInput,
  FillCursor,
  FillInput,
  ListResultsParams,
  OrderCursor,
  OrderInput,
  PositionCursor,
  PositionInput,
  ResultPage,
  RunRecord,
  RunRepository,
  RunResultRepository,
  RunStatus,
  SignalInput,
  StrategyRepository,
  WalkForwardWindowInput,
} from '../../../packages/database/src/index.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';
import type { UserId } from '../../../packages/database/src/ownership/user-id.js';
import {
  RUN_STATUS,
  RUN_TRANSITION_SOURCES,
  TERMINAL_RUN_STATUSES,
} from '../../../packages/database/src/runs/run.constant.js';

const EPOCH_MILLISECONDS = 1_700_000_000_000;
const MILLISECONDS_PER_ROW = 1_000;
const REPOSITORY_PAGE_MAXIMUM = 5_000;

export type StoredRun = { readonly userId: UserId; record: RunRecord; sequence: number };

export type ResultKind = 'signals' | 'orders' | 'fills' | 'positions' | 'equity' | 'windows';

type ResultStore = {
  signals: SignalInput[];
  orders: OrderInput[];
  fills: FillInput[];
  positions: PositionInput[];
  equity: EquityPointInput[];
  windows: WalkForwardWindowInput[];
};

export type InMemoryRuns = {
  readonly repository: RunRepository;
  readonly results: Pick<
    RunResultRepository,
    | 'listSignals'
    | 'listOrders'
    | 'listFills'
    | 'listPositions'
    | 'listEquityPoints'
    | 'listWindows'
  >;
  // Cada leitura de resultado anota o `limit` pedido: provam que a rota lê por página, nunca a série inteira.
  readonly listCalls: Record<ResultKind, number[]>;
  readonly seed: <TKind extends ResultKind>(
    runId: string,
    kind: TKind,
    rows: readonly ResultStore[TKind][number][],
  ) => void;
  readonly updateRun: (runId: string, changes: Partial<RunRecord>) => void;
  readonly all: () => readonly RunRecord[];
  readonly owned: () => readonly StoredRun[];
};

function isFinal(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

function pageOf<TRow, TCursor>(
  rows: readonly TRow[],
  params: ListResultsParams<TCursor>,
  isAfterCursor: (row: TRow, cursor: TCursor) => boolean,
  cursorOf: (row: TRow) => TCursor,
): ResultPage<TRow, TCursor> {
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), REPOSITORY_PAGE_MAXIMUM);
  const after = params.after;
  const remaining = after === undefined ? rows : rows.filter((row) => isAfterCursor(row, after));
  const items = remaining.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: remaining.length > limit && last !== undefined ? cursorOf(last) : undefined,
  };
}

export function createInMemoryRuns(
  strategies: Pick<StrategyRepository, 'findVersion'>,
): InMemoryRuns {
  const runs: StoredRun[] = [];
  const stores = new Map<string, ResultStore>();
  const listCalls: Record<ResultKind, number[]> = {
    signals: [],
    orders: [],
    fills: [],
    positions: [],
    equity: [],
    windows: [],
  };
  let sequence = 0;

  const ownedRun = (scope: OwnerScope, runId: string): StoredRun | undefined =>
    runs.find((stored) => stored.userId === scope.ownerUserId && stored.record.id === runId);

  function storeOf(runId: string): ResultStore {
    const existing = stores.get(runId);
    if (existing !== undefined) return existing;
    const created: ResultStore = {
      signals: [],
      orders: [],
      fills: [],
      positions: [],
      equity: [],
      windows: [],
    };
    stores.set(runId, created);
    return created;
  }

  function toRecord(params: CreateRunParams): RunRecord {
    sequence += 1;
    return {
      id: crypto.randomUUID(),
      strategyVersionId: params.strategyVersionId,
      kind: params.kind,
      status: RUN_STATUS.QUEUED,
      symbol: params.symbol,
      timeframe: params.timeframe,
      runParameters: structuredClone(params.runParameters),
      runHash: params.runHash,
      engineVersion: params.engineVersion,
      signalEngineVersion: params.signalEngineVersion,
      metricsVersion: params.metricsVersion,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      lastCandleTime: undefined,
      metrics: undefined,
      progress: 0,
      errorCode: undefined,
      migratedFromRunId: params.migratedFromRunId,
      request: params.request === undefined ? undefined : structuredClone(params.request),
      createdAt: new Date(EPOCH_MILLISECONDS + sequence * MILLISECONDS_PER_ROW),
      startedAt: undefined,
      finishedAt: undefined,
    };
  }

  const repository: RunRepository = {
    createRun: async (scope, params) => {
      if ((await strategies.findVersion(scope, params.strategyVersionId)) === undefined) {
        return undefined;
      }
      const record = toRecord(params);
      runs.push({ userId: scope.ownerUserId, record, sequence });
      return record;
    },
    findRun: (scope, runId) => Promise.resolve(ownedRun(scope, runId)?.record),
    listRuns: (scope, params) => {
      const owned = runs
        .filter((stored) => stored.userId === scope.ownerUserId)
        .filter((stored) => params.kind === undefined || stored.record.kind === params.kind)
        .sort((first, second) => second.sequence - first.sequence);
      const start =
        params.after === undefined
          ? 0
          : owned.findIndex((stored) => stored.record.id === params.after?.id) + 1;
      const page = owned.slice(start, start + params.limit);
      const last = page.at(-1);
      return Promise.resolve({
        runs: page.map((stored) => stored.record),
        nextCursor:
          start + params.limit < owned.length && last !== undefined
            ? { createdAt: last.record.createdAt.toISOString(), id: last.record.id }
            : undefined,
      });
    },
    transitionRun: (scope, params) => {
      const stored = ownedRun(scope, params.runId);
      if (stored === undefined) return Promise.resolve({ outcome: 'not_found' as const });
      if (!RUN_TRANSITION_SOURCES[params.to].includes(stored.record.status)) {
        return Promise.resolve({
          outcome: 'invalid_transition' as const,
          currentStatus: stored.record.status,
        });
      }
      const now = new Date(EPOCH_MILLISECONDS + (sequence + 1) * MILLISECONDS_PER_ROW);
      stored.record = {
        ...stored.record,
        status: params.to,
        errorCode: params.errorCode ?? stored.record.errorCode,
        metrics: params.metrics ?? stored.record.metrics,
        startedAt: params.to === RUN_STATUS.RUNNING ? now : stored.record.startedAt,
        finishedAt: isFinal(params.to) ? now : stored.record.finishedAt,
      };
      return Promise.resolve({ outcome: 'transitioned' as const, run: stored.record });
    },
    saveCheckpoint: () => Promise.resolve(false),
    readCheckpoint: () => Promise.resolve(undefined),
  };

  function lister<TRow, TCursor>(
    kind: ResultKind,
    pick: (store: ResultStore) => readonly TRow[],
    cursor: {
      readonly isAfter: (row: TRow, cursor: TCursor) => boolean;
      readonly of: (row: TRow) => TCursor;
    },
  ): (
    scope: OwnerScope,
    runId: string,
    params: ListResultsParams<TCursor>,
  ) => Promise<ResultPage<TRow, TCursor> | undefined> {
    return (scope, runId, params) => {
      listCalls[kind].push(params.limit);
      if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
      return Promise.resolve(pageOf(pick(storeOf(runId)), params, cursor.isAfter, cursor.of));
    };
  }

  const results: InMemoryRuns['results'] = {
    listSignals: lister<SignalInput, number>('signals', (store) => store.signals, {
      isAfter: (row, cursor) => row.candleTime > cursor,
      of: (row) => row.candleTime,
    }),
    listEquityPoints: lister<EquityPointInput, number>('equity', (store) => store.equity, {
      isAfter: (row, cursor) => row.candleTime > cursor,
      of: (row) => row.candleTime,
    }),
    listWindows: lister<WalkForwardWindowInput, number>('windows', (store) => store.windows, {
      isAfter: (row, cursor) => row.windowIndex > cursor,
      of: (row) => row.windowIndex,
    }),
    listOrders: lister<OrderInput, OrderCursor>('orders', (store) => store.orders, {
      isAfter: (row, cursor) =>
        row.createdCandleTime > cursor.createdCandleTime ||
        (row.createdCandleTime === cursor.createdCandleTime && row.engineKey > cursor.engineKey),
      of: (row) => ({ createdCandleTime: row.createdCandleTime, engineKey: row.engineKey }),
    }),
    listFills: lister<FillInput, FillCursor>('fills', (store) => store.fills, {
      isAfter: (row, cursor) =>
        row.candleTime > cursor.candleTime ||
        (row.candleTime === cursor.candleTime && row.orderKey > cursor.orderKey),
      of: (row) => ({ candleTime: row.candleTime, orderKey: row.orderKey }),
    }),
    listPositions: lister<PositionInput, PositionCursor>('positions', (store) => store.positions, {
      isAfter: (row, cursor) =>
        row.openedCandleTime > cursor.openedCandleTime ||
        (row.openedCandleTime === cursor.openedCandleTime && row.engineKey > cursor.engineKey),
      of: (row) => ({ openedCandleTime: row.openedCandleTime, engineKey: row.engineKey }),
    }),
  };

  return {
    repository,
    results,
    listCalls,
    seed: (runId, kind, rows): void => {
      const store = storeOf(runId);
      (store[kind] as unknown[]).push(...rows);
    },
    updateRun: (runId, changes): void => {
      const stored = runs.find((candidate) => candidate.record.id === runId);
      if (stored !== undefined) stored.record = { ...stored.record, ...changes };
    },
    all: () => runs.map((stored) => stored.record),
    owned: () => runs,
  };
}

export type InMemoryCandles = {
  readonly repository: Pick<CandleRepository, 'findCandles'>;
  readonly queries: { from: number; to: number; limit: number | undefined }[];
};

export function createInMemoryCandleSeries(seed: readonly CandleRecord[]): InMemoryCandles {
  const queries: InMemoryCandles['queries'] = [];
  return {
    queries,
    repository: {
      findCandles: (params): Promise<readonly CandleRecord[]> => {
        queries.push({ from: params.from, to: params.to, limit: params.limit });
        const matching = seed
          .filter(
            (candle) =>
              candle.exchange === params.exchange &&
              candle.symbol === params.symbol &&
              candle.timeframe === params.timeframe &&
              candle.openTime >= params.from &&
              candle.openTime < params.to,
          )
          .sort((first, second) => first.openTime - second.openTime);
        return Promise.resolve(
          params.limit === undefined ? matching : matching.slice(0, params.limit),
        );
      },
    },
  };
}
