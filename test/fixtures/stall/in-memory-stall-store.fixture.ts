// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CloseStallEpisodeParams,
  JsonContainer,
  OpenStallEpisodeParams,
  RunStallRepository,
  StallCandidate,
  StallSession,
} from '../../../packages/database/src/index.js';

export type FakeStallRun = {
  runId: string;
  userId: string;
  symbol: string;
  timeframe: string;
  periodStart: number;
  lastCandleTime: number | undefined;
  isWaitingForData: boolean;
  stalledSince: number | undefined;
  status: 'running' | 'cancelled' | 'completed';
};

export type FakeStallAlert = {
  readonly runId: string;
  readonly userId: string;
  readonly candleTime: number;
  readonly side: 'STALL' | 'RESUME';
  readonly payload: JsonContainer;
};

export type FakeStallNotification = { readonly runId: string; readonly stalledSince: number };

// O mesmo contrato do repositório de verdade (trava consultiva, escritas guardadas, alerta único por chave, `RESUME` só atrás
// de um `STALL`, dono sem Telegram sem alerta), em memória. A atomicidade e a trava reais são provadas contra o Postgres.
export type InMemoryStallStore = {
  readonly repository: RunStallRepository;
  readonly runs: Map<string, FakeStallRun>;
  readonly alerts: FakeStallAlert[];
  readonly notifications: FakeStallNotification[];
  readonly telegramUsers: Set<string>;
  readonly lockAttempts: { count: number };
  // Quantas transações deixaram de pegar a trava.
  readonly lockMisses: { count: number };
  readonly addRun: (overrides: Partial<FakeStallRun> & { runId: string }) => FakeStallRun;
};

function toCandidate(run: FakeStallRun): StallCandidate {
  return {
    runId: run.runId,
    symbol: run.symbol,
    timeframe: run.timeframe,
    periodStart: run.periodStart,
    lastCandleTime: run.lastCandleTime,
    isWaitingForData: run.isWaitingForData,
    stalledSince: run.stalledSince,
  };
}

function hasAlert(
  store: InMemoryStallStore,
  key: { runId: string; candleTime: number; side: string },
): boolean {
  return store.alerts.some(
    (alert) =>
      alert.runId === key.runId && alert.candleTime === key.candleTime && alert.side === key.side,
  );
}

function enqueue(store: InMemoryStallStore, alert: FakeStallAlert): void {
  if (!store.telegramUsers.has(alert.userId)) return;
  if (alert.side === 'RESUME' && !hasAlert(store, { ...alert, side: 'STALL' })) return;
  if (hasAlert(store, alert)) return;
  store.alerts.push(alert);
}

function openEpisode(store: InMemoryStallStore, params: OpenStallEpisodeParams): boolean {
  const run = store.runs.get(params.candidate.runId);
  const isGuardOk =
    run !== undefined &&
    run.status === 'running' &&
    run.stalledSince === undefined &&
    run.lastCandleTime === params.candidate.lastCandleTime;
  if (!isGuardOk) return false;
  run.stalledSince = params.stalledSince;
  enqueue(store, {
    runId: run.runId,
    userId: run.userId,
    candleTime: params.stalledSince,
    side: 'STALL',
    payload: params.alertPayload,
  });
  store.notifications.push({ runId: run.runId, stalledSince: params.stalledSince });
  return true;
}

function closeEpisode(store: InMemoryStallStore, params: CloseStallEpisodeParams): boolean {
  const run = store.runs.get(params.candidate.runId);
  const openSince = params.candidate.stalledSince;
  if (run === undefined || openSince === undefined) return false;
  if (run.status !== 'running' || run.stalledSince !== openSince) return false;
  run.stalledSince = undefined;
  enqueue(store, {
    runId: run.runId,
    userId: run.userId,
    candleTime: openSince,
    side: 'RESUME',
    payload: params.alertPayload,
  });
  store.notifications.push({ runId: run.runId, stalledSince: openSince });
  return true;
}

function createSession(params: {
  readonly store: InMemoryStallStore;
  readonly lock: { holder: symbol | undefined };
  readonly me: symbol;
}): StallSession {
  const { store, lock, me } = params;
  return {
    tryAcquireLock: (): Promise<boolean> => {
      store.lockAttempts.count += 1;
      if (lock.holder !== undefined && lock.holder !== me) {
        store.lockMisses.count += 1;
        return Promise.resolve(false);
      }
      lock.holder = me;
      return Promise.resolve(true);
    },
    listCandidates: () =>
      Promise.resolve(
        [...store.runs.values()].filter((run) => run.status === 'running').map(toCandidate),
      ),
    openEpisode: (params) => Promise.resolve(openEpisode(store, params)),
    closeEpisode: (params) => Promise.resolve(closeEpisode(store, params)),
    clearInactiveEpisodes: (): Promise<number> => {
      let cleared = 0;
      for (const run of store.runs.values()) {
        if (run.status === 'running' || run.stalledSince === undefined) continue;
        run.stalledSince = undefined;
        cleared += 1;
      }
      return Promise.resolve(cleared);
    },
  };
}

export function createInMemoryStallStore(): InMemoryStallStore {
  const lock: { holder: symbol | undefined } = { holder: undefined };
  const runs = new Map<string, FakeStallRun>();
  const store: InMemoryStallStore = {
    runs,
    alerts: [],
    notifications: [],
    telegramUsers: new Set<string>(),
    lockAttempts: { count: 0 },
    lockMisses: { count: 0 },
    addRun: (overrides) => {
      const run: FakeStallRun = {
        userId: 'user-a',
        symbol: 'BTCUSDT',
        timeframe: '1h',
        periodStart: 0,
        lastCandleTime: undefined,
        isWaitingForData: false,
        stalledSince: undefined,
        status: 'running',
        ...overrides,
      };
      runs.set(run.runId, run);
      return run;
    },
    repository: {
      inTransaction: async (work) => {
        const me = Symbol('transaction');
        try {
          return await work(createSession({ store, lock, me }));
        } finally {
          if (lock.holder === me) lock.holder = undefined;
        }
      },
    },
  };
  return store;
}
