// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  HistoricalHitRate,
  LiveBlueprint,
  LiveCommitOutcome,
  LiveRunClaims,
  LiveRunDatabase,
  LiveRunSession,
} from '../../../apps/worker-cryptoada/src/live/live-run.types.js';
import type {
  AlertInput,
  ClaimedLiveRun,
  EngineCheckpoint,
  RenewHeartbeatResult,
  RunRecord,
  RunStatus,
  StrategyVersionRecord,
} from '../../../packages/database/src/index.js';
import {
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
  type EngineCandle,
  type StoredSentimentObservation,
  type StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';
import {
  appendRows,
  cloneResults,
  createEmptyResults,
  snapshotResults,
} from '../backtest/in-memory-backtest-results.fixture.js';
import type {
  StoredCheckpoint,
  StoredResults,
} from '../backtest/in-memory-backtest-types.fixture.js';
import { CLASSIC_STRATEGY } from '../strategy-engine/signal/classic-signals.fixture.js';

const TAMPERED_HASH = 'f'.repeat(64);
const FIRST_RUN_NUMBER = 1;
let runCounter = FIRST_RUN_NUMBER;

export type LiveHooks = {
  // Chamado antes de gravar o `commit`-ésimo passo (1 = o primeiro); lançar aqui é o processo que morre ANTES do COMMIT.
  beforeCommit?: (commit: number) => void;
  // Depois de as linhas entrarem e antes do checkpoint: a queda no meio da transação desfaz tudo.
  afterAppend?: (commit: number) => void;
  // Depois do COMMIT (1 = o primeiro): o cancelamento do usuário e a queda do processo chegam aqui.
  afterCommit?: (commit: number, controls: LiveControls) => void;
  // Erro que a leitura de candles lança (banco fora do ar).
  findCandlesError?: () => Error | undefined;
  // Leitura atrasada: devolve também os candles que o avaliador já processou (a fonte repete candle).
  isStaleRead?: boolean;
};

export type LiveControls = {
  readonly cancel: () => void;
  readonly deactivateOwner: () => void;
};

export type LiveScenario = {
  readonly candles: readonly EngineCandle[];
  readonly periodStart: number;
  readonly runParameters: RunRecord['runParameters'];
  readonly runHash: string;
  readonly sentiment?: readonly StoredSentimentObservation[];
  readonly strategy?: StrategyVersion;
  readonly tamper?: 'run_hash' | 'config_hash' | 'engine_version';
  readonly hooks?: LiveHooks;
  readonly kind?: RunRecord['kind'];
  // O acerto histórico que a leitura do último walk-forward devolve; `'error'` é a leitura que falha.
  readonly hitRate?: HistoricalHitRate | 'error';
};

export type InMemoryLiveState = {
  status: RunStatus;
  errorCode: string | undefined;
  checkpoint: StoredCheckpoint | undefined;
  results: StoredResults;
  // Os alertas enfileirados pelos passos CONFIRMADOS, na chave (candle, lado) que o banco usa.
  alerts: Map<string, AlertInput>;
  commits: number;
  claimedBy: string | undefined;
  isOwnerActive: boolean;
  isHeartbeatExpired: boolean;
  candles: EngineCandle[];
};

export type InMemoryLive = {
  readonly runId: string;
  readonly database: LiveRunDatabase;
  readonly claims: LiveRunClaims;
  readonly state: InMemoryLiveState;
  readonly addCandles: (candles: readonly EngineCandle[]) => void;
  readonly snapshot: () => Record<string, readonly unknown[]>;
  readonly calls: {
    findCandles: number;
    listSentiment: number;
    commitStep: number;
    findHitRate: number;
  };
  readonly controls: LiveControls;
};

function buildBlueprint(scenario: LiveScenario, runId: string): LiveBlueprint {
  const first = scenario.candles[0];
  const run: RunRecord = {
    id: runId,
    strategyVersionId: '018f0000-0000-7000-8000-0000000000aa',
    kind: scenario.kind ?? 'live_paper',
    status: 'running',
    symbol: first?.symbol ?? 'BTCUSDT',
    timeframe: first?.timeframe ?? '1h',
    runParameters: scenario.runParameters,
    runHash: scenario.tamper === 'run_hash' ? TAMPERED_HASH : scenario.runHash,
    engineVersion: scenario.tamper === 'engine_version' ? 'engine-1' : ENGINE_VERSION,
    signalEngineVersion: SIGNAL_ENGINE_VERSION,
    metricsVersion: METRICS_VERSION,
    periodStart: scenario.periodStart,
    periodEnd: undefined,
    lastCandleTime: undefined,
    metrics: undefined,
    progress: 0,
    errorCode: undefined,
    migratedFromRunId: undefined,
    request: undefined,
    createdAt: new Date(0),
    startedAt: undefined,
    finishedAt: undefined,
  };
  const strategy = scenario.strategy ?? CLASSIC_STRATEGY;
  const version: StrategyVersionRecord = {
    id: run.strategyVersionId,
    strategyId: '018f0000-0000-7000-8000-0000000000bb',
    version: 1,
    config: structuredClone(strategy.config),
    configHash: scenario.tamper === 'config_hash' ? TAMPERED_HASH : strategy.configHash,
    createdAt: new Date(0),
  };
  return { run, version };
}

type Context = {
  readonly scenario: LiveScenario;
  readonly blueprint: LiveBlueprint;
  readonly live: InMemoryLive;
};

function commitStep(
  context: Context,
  commit: Parameters<LiveRunSession['commitStep']>[0],
): LiveCommitOutcome {
  const { live, scenario } = context;
  const { state } = live;
  live.calls.commitStep += 1;
  if (state.status !== 'running') return 'stopped';
  const hooks = scenario.hooks;
  const attempt = state.commits + 1;
  hooks?.beforeCommit?.(attempt);
  const stage = cloneResults(state.results);
  appendRows(stage, commit.rows);
  const stagedAlerts = new Map(state.alerts);
  for (const alert of commit.alerts) {
    const key = `${alert.candleTime}|${alert.side}`;
    if (!stagedAlerts.has(key)) stagedAlerts.set(key, alert);
  }
  hooks?.afterAppend?.(attempt);
  const last = state.checkpoint?.lastCandleTime;
  if (last !== undefined && last >= commit.checkpoint.lastCandleTime) return 'already_recorded';
  state.results = stage;
  state.alerts = stagedAlerts;
  state.checkpoint = {
    engineState: structuredClone(commit.checkpoint.engineState),
    lastCandleTime: commit.checkpoint.lastCandleTime,
    progress: commit.checkpoint.progress,
  };
  state.commits = attempt;
  hooks?.afterCommit?.(attempt, live.controls);
  return 'committed';
}

function readCheckpoint(state: InMemoryLiveState): EngineCheckpoint | undefined {
  const { checkpoint } = state;
  if (checkpoint === undefined) return undefined;
  return JSON.parse(
    JSON.stringify({
      engineState: checkpoint.engineState,
      lastCandleTime: checkpoint.lastCandleTime,
      progress: checkpoint.progress,
    }),
  ) as EngineCheckpoint;
}

function createSession(context: Context): LiveRunSession {
  const { live, blueprint, scenario } = context;
  const { state } = live;
  return {
    findRun: () =>
      Promise.resolve({ ...blueprint, run: { ...blueprint.run, status: state.status } }),
    readCheckpoint: () => Promise.resolve(readCheckpoint(state)),
    findCandles: (window): Promise<readonly EngineCandle[]> => {
      live.calls.findCandles += 1;
      const from = scenario.hooks?.isStaleRead === true ? 0 : window.from;
      const failure = scenario.hooks?.findCandlesError?.();
      if (failure !== undefined) return Promise.reject(failure);
      return Promise.resolve(
        [...state.candles]
          .sort((first, second) => first.openTime - second.openTime)
          .filter((candle) => candle.openTime >= from && candle.openTime < window.to)
          .slice(0, window.limit),
      );
    },
    listSentiment: (query): Promise<readonly StoredSentimentObservation[]> => {
      live.calls.listSentiment += 1;
      return Promise.resolve(
        (scenario.sentiment ?? []).filter(
          (item) => item.observedAt <= query.until && item.createdAt <= query.until,
        ),
      );
    },
    findHitRate: (): Promise<HistoricalHitRate | undefined> => {
      live.calls.findHitRate += 1;
      if (scenario.hitRate === 'error') return Promise.reject(new Error('leitura indisponível'));
      return Promise.resolve(scenario.hitRate);
    },
    commitStep: (commit): Promise<LiveCommitOutcome> => {
      try {
        return Promise.resolve(commitStep(context, commit));
      } catch (error: unknown) {
        return Promise.reject(error instanceof Error ? error : new Error('falha injetada'));
      }
    },
    failRun: (errorCode): Promise<boolean> => {
      if (state.status !== 'running' && state.status !== 'queued') return Promise.resolve(false);
      state.status = 'failed';
      state.errorCode = errorCode;
      state.claimedBy = undefined;
      return Promise.resolve(true);
    },
  };
}

function createClaims(live: InMemoryLive): LiveRunClaims {
  const { state } = live;
  return {
    claimLiveRuns: ({ claimedBy }): Promise<readonly ClaimedLiveRun[]> => {
      if (!state.isOwnerActive) return Promise.resolve([]);
      const isQueued = state.status === 'queued';
      const isStale = state.status === 'running' && state.isHeartbeatExpired;
      if (!isQueued && !isStale) return Promise.resolve([]);
      state.status = 'running';
      state.claimedBy = claimedBy;
      state.isHeartbeatExpired = false;
      return Promise.resolve([{ runId: live.runId, isTakeover: isStale }]);
    },
    renewHeartbeat: ({ claimedBy, runIds }): Promise<RenewHeartbeatResult> => {
      if (!runIds.includes(live.runId)) return Promise.resolve({ held: [], lost: [] });
      if (state.status === 'running' && state.claimedBy === claimedBy) {
        return Promise.resolve({ held: [live.runId], lost: [] });
      }
      const isTaken = state.status === 'queued' || state.status === 'running';
      return Promise.resolve({ held: [], lost: isTaken ? [live.runId] : [] });
    },
    releaseClaimedRuns: ({ claimedBy }): Promise<number> => {
      if (state.status !== 'running' || state.claimedBy !== claimedBy) return Promise.resolve(0);
      state.status = 'queued';
      state.claimedBy = undefined;
      return Promise.resolve(1);
    },
    cancelLiveRunsOfInactiveOwners: (): Promise<number> => {
      if (state.isOwnerActive || state.status !== 'running') return Promise.resolve(0);
      state.status = 'cancelled';
      state.claimedBy = undefined;
      return Promise.resolve(1);
    },
  };
}

export function createInMemoryLive(scenario: LiveScenario): InMemoryLive {
  const runId = `018f0000-0000-7000-8000-${String(runCounter).padStart(12, '0')}`;
  runCounter += 1;
  const state: InMemoryLiveState = {
    status: 'queued',
    errorCode: undefined,
    checkpoint: undefined,
    results: createEmptyResults(),
    alerts: new Map(),
    commits: 0,
    claimedBy: undefined,
    isOwnerActive: true,
    isHeartbeatExpired: false,
    candles: [...scenario.candles],
  };
  const controls: LiveControls = {
    cancel: () => {
      state.status = 'cancelled';
      state.claimedBy = undefined;
    },
    deactivateOwner: () => {
      state.isOwnerActive = false;
    },
  };
  const blueprint = buildBlueprint(scenario, runId);
  const live: InMemoryLive = {
    runId,
    state,
    controls,
    calls: { findCandles: 0, listSentiment: 0, commitStep: 0, findHitRate: 0 },
    addCandles: (candles) => state.candles.push(...candles),
    snapshot: () => snapshotResults(state.results),
    database: { attach: () => Promise.resolve(undefined) },
    claims: undefined as unknown as LiveRunClaims,
  };
  const context: Context = { scenario, blueprint, live };
  return {
    ...live,
    claims: createClaims(live),
    database: {
      attach: (id) =>
        Promise.resolve(id === runId && state.isOwnerActive ? createSession(context) : undefined),
    },
  };
}

// Várias simulações no mesmo banco: o avaliador de produção enxerga todas, cada uma com o estado próprio.
export function combineLives(lives: readonly InMemoryLive[]): {
  readonly database: LiveRunDatabase;
  readonly claims: LiveRunClaims;
} {
  const merge = async <TItem>(
    pick: (live: InMemoryLive) => Promise<readonly TItem[]>,
  ): Promise<TItem[]> => (await Promise.all(lives.map(pick))).flat();
  return {
    database: {
      attach: async (id): Promise<LiveRunSession | undefined> => {
        for (const live of lives) {
          const session = await live.database.attach(id);
          if (session !== undefined) return session;
        }
        return undefined;
      },
    },
    claims: {
      claimLiveRuns: (params) => merge((live) => live.claims.claimLiveRuns(params)),
      renewHeartbeat: async (params): Promise<RenewHeartbeatResult> => {
        const results = await Promise.all(lives.map((live) => live.claims.renewHeartbeat(params)));
        return {
          held: results.flatMap((result) => result.held),
          lost: results.flatMap((result) => result.lost),
        };
      },
      releaseClaimedRuns: async (params): Promise<number> => {
        const counts = await Promise.all(
          lives.map((live) => live.claims.releaseClaimedRuns(params)),
        );
        return counts.reduce((sum, count) => sum + count, 0);
      },
      cancelLiveRunsOfInactiveOwners: async (): Promise<number> => {
        const counts = await Promise.all(
          lives.map((live) => live.claims.cancelLiveRunsOfInactiveOwners()),
        );
        return counts.reduce((sum, count) => sum + count, 0);
      },
    },
  };
}
