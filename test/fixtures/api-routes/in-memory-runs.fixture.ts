// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_DELETE_OUTCOME } from '../../../packages/database/src/runs/run.types.js';
import type {
  CandleRecord,
  CandleRepository,
  CreateRunParams,
  EquityPointInput,
  FillCursor,
  FillInput,
  FillMarkerInput,
  ListPositionsParams,
  ListResultsParams,
  OrderCursor,
  OrderInput,
  PositionCursor,
  PositionInput,
  ResultPage,
  RunLogCursor,
  RunLogEntry,
  RunRecord,
  RunLiveStatusRepository,
  RunRepository,
  RunResultRepository,
  RunStatus,
  SignalInput,
  StrategyRepository,
  WalkForwardWindowInput,
} from '../../../packages/database/src/index.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';
import { createInMemoryLiveStatus } from './in-memory-live-status.fixture.js';
import {
  referenceFillClusters,
  referencePriceColumns,
  referenceTradeTotals,
} from '../run-chart/chart-oracle.fixture.js';
import type { UserId } from '../../../packages/database/src/ownership/user-id.js';
import {
  RUN_STATUS,
  RUN_TRANSITION_SOURCES,
  TERMINAL_RUN_STATUSES,
} from '../../../packages/database/src/runs/run.constant.js';

const EPOCH_MILLISECONDS = 1_700_000_000_000;
const MILLISECONDS_PER_ROW = 1_000;
const REPOSITORY_PAGE_MAXIMUM = 5_000;

export type StoredRun = {
  readonly userId: UserId;
  record: RunRecord;
  sequence: number;
  // Exclusão lógica: a execução some das leituras do dono, mas a linha continua guardada.
  deletedAt?: number;
};

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
    | 'listFillsOfPositions'
    | 'listPriceColumns'
    | 'listFillMarkers'
    | 'countFillsInRange'
    | 'listFillClusters'
    | 'readTradeTotals'
    | 'listEquityPoints'
    | 'listWindows'
    | 'listLog'
    | 'listSurvivalPoints'
  >;
  // As leituras do acompanhamento ao vivo e o nome de cada consulta feita (a harness acrescenta as do pedido).
  readonly liveStatus: RunLiveStatusRepository;
  readonly liveCalls: string[];
  // Cada leitura de resultado anota o `limit` pedido: provam que a rota lê por página, nunca a série inteira.
  readonly listCalls: Record<ResultKind | 'log', number[]>;
  // As chaves de posição de cada leitura de preenchimentos: prova que a página inteira vai numa consulta só.
  readonly fillLookups: (readonly string[])[];
  // Quantas vezes cada leitura do gráfico rodou: prova que os marcadores só são lidos até o limite.
  readonly chartCalls: { columns: number; markers: number; counts: number; clusters: number };
  // Quantas linhas cada leitura da sobrevivência devolveu: o custo não pode crescer com a série.
  readonly survivalRowsRead: number[];
  readonly seed: <TKind extends ResultKind>(
    runId: string,
    kind: TKind,
    rows: readonly ResultStore[TKind][number][],
  ) => void;
  readonly updateRun: (runId: string, changes: Partial<RunRecord>) => void;
  readonly all: () => readonly RunRecord[];
  readonly owned: () => readonly StoredRun[];
  // Tira tudo da memória (o que um teste guardou não pode contar na cota do seguinte).
  readonly purgeAll: () => void;
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
  // Chamado quando uma execução fica atrelada a uma meta: a FK RESTRICT do banco, que impede apagar a meta.
  onGoalLinked: (goalId: string) => void = () => undefined,
  // As velas que o preço do gráfico lê (a mesma semente do repositório de velas do harness).
  candleSeed: readonly CandleRecord[] = [],
): InMemoryRuns {
  const runs: StoredRun[] = [];
  const stores = new Map<string, ResultStore>();
  const listCalls: Record<ResultKind | 'log', number[]> = {
    log: [],
    signals: [],
    orders: [],
    fills: [],
    positions: [],
    equity: [],
    windows: [],
  };
  const survivalRowsRead: number[] = [];
  const fillLookups: (readonly string[])[] = [];
  const chartCalls = { columns: 0, markers: 0, counts: 0, clusters: 0 };
  let sequence = 0;

  const ownedRun = (scope: OwnerScope, runId: string): StoredRun | undefined =>
    runs.find(
      (stored) =>
        stored.userId === scope.ownerUserId &&
        stored.record.id === runId &&
        stored.deletedAt === undefined,
    );

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
      goalId: params.goalId,
      goalOutcome: undefined,
      goalOutcomeCandleTime: undefined,
      waitingSince: undefined,
      waitingOpenTime: undefined,
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
      if (params.goalId !== undefined) onGoalLinked(params.goalId);
      runs.push({ userId: scope.ownerUserId, record, sequence });
      return record;
    },
    findRun: (scope, runId) => Promise.resolve(ownedRun(scope, runId)?.record),
    listRuns: (scope, params) => {
      const owned = runs
        .filter((stored) => stored.userId === scope.ownerUserId && stored.deletedAt === undefined)
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
    deleteRun: (scope, runId) => {
      const stored = ownedRun(scope, runId);
      if (stored === undefined) return Promise.resolve(RUN_DELETE_OUTCOME.NOT_FOUND);
      if (!isFinal(stored.record.status)) return Promise.resolve(RUN_DELETE_OUTCOME.NOT_FINISHED);
      stored.deletedAt = Date.now();
      return Promise.resolve(RUN_DELETE_OUTCOME.DELETED);
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
      // Só as séries que aceitam `order=desc` (patrimônio e sinais) declaram o "antes do cursor".
      readonly isBefore?: (row: TRow, cursor: TCursor) => boolean;
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
      const isDescending = params.order === 'desc' && cursor.isBefore !== undefined;
      const rows = isDescending ? [...pick(storeOf(runId))].reverse() : pick(storeOf(runId));
      const isAfter =
        isDescending && cursor.isBefore !== undefined ? cursor.isBefore : cursor.isAfter;
      return Promise.resolve(pageOf(rows, params, isAfter, cursor.of));
    };
  }

  const LOG_RANK = { fill: 1, signal: 2, order: 3 } as const;
  const logRowsOf = (store: ResultStore): readonly RunLogEntry[] => {
    const blank = {
      action: undefined,
      side: undefined,
      orderKey: undefined,
      orderType: undefined,
      purpose: undefined,
      status: undefined,
      score: undefined,
      regime: undefined,
      price: undefined,
      limitPrice: undefined,
      triggerPrice: undefined,
      quantity: undefined,
      notional: undefined,
      fee: undefined,
      riskAmount: undefined,
      stopDistance: undefined,
      targetDistance: undefined,
      lastEventTime: undefined,
      reason: undefined,
    } as const;
    return [
      ...store.signals.map((row) => ({
        ...blank,
        kind: 'signal' as const,
        eventTime: row.candleTime,
        action: row.action,
        score: row.score,
        regime: row.regime,
        reason: row.reason,
      })),
      ...store.orders.map((row) => ({
        ...blank,
        kind: 'order' as const,
        eventTime: row.createdCandleTime,
        side: row.side,
        orderKey: row.engineKey,
        orderType: row.type,
        purpose: row.purpose,
        status: row.status,
        price: row.price,
        limitPrice: row.limitPrice,
        triggerPrice: row.triggerPrice,
        quantity: row.quantity,
        riskAmount: row.riskAmount,
        stopDistance: row.stopDistance,
        targetDistance: row.targetDistance,
        lastEventTime: row.lastEventCandleTime,
        reason: row.reason,
      })),
      ...store.fills.map((row) => ({
        ...blank,
        kind: 'fill' as const,
        eventTime: row.candleTime,
        side: row.side,
        orderKey: row.orderKey,
        price: row.price,
        quantity: row.quantity,
        notional: row.notional,
        fee: row.fee,
      })),
    ];
  };
  const logCursorOf = (row: RunLogEntry): RunLogCursor => ({
    eventTime: row.eventTime,
    rank: LOG_RANK[row.kind],
    key: row.orderKey ?? '',
  });
  const compareLog = (first: RunLogCursor, second: RunLogCursor): number =>
    first.eventTime - second.eventTime ||
    first.rank - second.rank ||
    (first.key < second.key ? -1 : first.key > second.key ? 1 : 0);

  const listLog: InMemoryRuns['results']['listLog'] = (scope, runId, params) => {
    listCalls.log.push(params.limit);
    if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
    const ordered = [...logRowsOf(storeOf(runId))].sort((first, second) =>
      compareLog(logCursorOf(first), logCursorOf(second)),
    );
    return Promise.resolve(
      pageOf(
        ordered,
        params,
        (row, cursor) => compareLog(logCursorOf(row), cursor) > 0,
        logCursorOf,
      ),
    );
  };

  // A referência do que o banco devolve: os cinco pontos que decidem piso, dobro, vale, pico e último (valores de teste são
  // inteiros pequenos, então `Number` basta aqui; o SQL real é provado no `make database-test`).
  const listSurvivalPoints: InMemoryRuns['results']['listSurvivalPoints'] = (
    scope,
    runId,
    params,
  ) => {
    if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
    const counted = storeOf(runId).equity.filter((point) => point.candleTime >= params.startTime);
    const first = (matches: (point: EquityPointInput) => boolean): EquityPointInput | undefined =>
      counted.find(matches);
    const extreme = (
      better: (candidate: EquityPointInput, current: EquityPointInput) => boolean,
    ): EquityPointInput | undefined =>
      counted.reduce<EquityPointInput | undefined>(
        (best, point) => (best === undefined || better(point, best) ? point : best),
        undefined,
      );
    const chosen = [
      first((point) => Number(point.equityAtLow) <= Number(params.floorLevel)),
      first((point) => Number(point.equity) >= Number(params.targetLevel)),
      extreme((point, best) => Number(point.equityAtLow) < Number(best.equityAtLow)),
      extreme((point, best) => Number(point.equity) > Number(best.equity)),
      counted.at(-1),
    ].filter((point): point is EquityPointInput => point !== undefined);
    const unique = [...new Map(chosen.map((point) => [point.candleTime, point])).values()].sort(
      (left, right) => left.candleTime - right.candleTime,
    );
    survivalRowsRead.push(unique.length);
    return Promise.resolve(
      unique.map((point) => ({
        candleTime: point.candleTime,
        equity: point.equity,
        equityAtLow: point.equityAtLow,
      })),
    );
  };

  const isInRange = (time: number | undefined, range: { from: number; to: number }): boolean =>
    time !== undefined && time >= range.from && time < range.to;

  // Compra OU venda dentro de [from, to): a posição que atravessa a faixa sem preenchimento nela fica fora.
  const matchesPositionFilter = (row: PositionInput, params: ListPositionsParams): boolean =>
    (params.status === undefined || row.status === params.status) &&
    (params.range === undefined ||
      isInRange(row.openedCandleTime, params.range) ||
      isInRange(row.closedCandleTime, params.range));

  const listPositions: InMemoryRuns['results']['listPositions'] = (scope, runId, params) => {
    listCalls.positions.push(params.limit);
    if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
    const rows = storeOf(runId).positions.filter((row) => matchesPositionFilter(row, params));
    return Promise.resolve(
      pageOf(
        rows,
        params,
        (row, cursor: PositionCursor) =>
          row.openedCandleTime > cursor.openedCandleTime ||
          (row.openedCandleTime === cursor.openedCandleTime && row.engineKey > cursor.engineKey),
        (row) => ({ openedCandleTime: row.openedCandleTime, engineKey: row.engineKey }),
      ),
    );
  };

  const listFillsOfPositions: InMemoryRuns['results']['listFillsOfPositions'] = (
    scope,
    runId,
    positionKeys,
  ) => {
    fillLookups.push(positionKeys);
    if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
    return Promise.resolve(
      storeOf(runId).fills.filter((fill) => positionKeys.includes(fill.positionKey)),
    );
  };

  const isFillInRange = (fill: FillInput, range: { from: number; to: number }): boolean =>
    fill.candleTime >= range.from && fill.candleTime < range.to;

  const listPriceColumns: InMemoryRuns['results']['listPriceColumns'] = (scope, runId, params) => {
    chartCalls.columns += 1;
    if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
    const candles = candleSeed.filter(
      (candle) =>
        candle.exchange === params.exchange &&
        candle.symbol === params.symbol &&
        candle.timeframe === params.timeframe,
    );
    return Promise.resolve(
      referencePriceColumns({ candles, range: params.range, columns: params.columns }),
    );
  };

  const listFillMarkers: InMemoryRuns['results']['listFillMarkers'] = (scope, runId, params) => {
    chartCalls.markers += 1;
    if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
    const store = storeOf(runId);
    const markers: FillMarkerInput[] = store.fills
      .filter((fill) => isFillInRange(fill, params.range))
      .sort(
        (left, right) =>
          left.candleTime - right.candleTime || (left.orderKey < right.orderKey ? -1 : 1),
      )
      .slice(0, params.limit)
      .map((fill) => ({
        ...fill,
        netProfit:
          fill.side === 'sell'
            ? store.positions.find((position) => position.engineKey === fill.positionKey)?.netProfit
            : undefined,
      }));
    return Promise.resolve(markers);
  };

  const countFillsInRange: InMemoryRuns['results']['countFillsInRange'] = (scope, runId, range) => {
    chartCalls.counts += 1;
    if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
    const inRange = storeOf(runId).fills.filter((fill) => isFillInRange(fill, range));
    return Promise.resolve({
      buys: inRange.filter((fill) => fill.side === 'buy').length,
      sells: inRange.filter((fill) => fill.side === 'sell').length,
    });
  };

  const listFillClusters: InMemoryRuns['results']['listFillClusters'] = (scope, runId, params) => {
    chartCalls.clusters += 1;
    if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
    return Promise.resolve(
      referenceFillClusters({
        fills: storeOf(runId).fills,
        range: params.range,
        columns: params.columns,
      }),
    );
  };

  const readTradeTotals: InMemoryRuns['results']['readTradeTotals'] = (scope, runId) => {
    if (ownedRun(scope, runId) === undefined) return Promise.resolve(undefined);
    const store = storeOf(runId);
    return Promise.resolve(
      referenceTradeTotals({ positions: store.positions, fills: store.fills }),
    );
  };

  const liveCalls: string[] = [];
  const liveStatus = createInMemoryLiveStatus({
    isOwned: (scope, runId) => ownedRun(scope, runId) !== undefined,
    storeOf,
    candleSeed,
    calls: liveCalls,
  });

  const results: InMemoryRuns['results'] = {
    readTradeTotals,
    listPriceColumns,
    listFillMarkers,
    countFillsInRange,
    listFillClusters,
    listLog,
    listSurvivalPoints,
    listSignals: lister<SignalInput, number>('signals', (store) => store.signals, {
      isAfter: (row, cursor) => row.candleTime > cursor,
      isBefore: (row, cursor) => row.candleTime < cursor,
      of: (row) => row.candleTime,
    }),
    listEquityPoints: lister<EquityPointInput, number>('equity', (store) => store.equity, {
      isAfter: (row, cursor) => row.candleTime > cursor,
      isBefore: (row, cursor) => row.candleTime < cursor,
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
    listPositions,
    listFillsOfPositions,
  };

  return {
    repository,
    results,
    liveStatus,
    liveCalls,
    listCalls,
    fillLookups,
    chartCalls,
    survivalRowsRead,
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
    purgeAll: (): void => {
      runs.length = 0;
      stores.clear();
    },
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
