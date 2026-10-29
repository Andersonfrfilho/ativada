// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  DuelEquityPoint,
  LatestWorkerHeartbeat,
  ModelDuelRepository,
  ModelTeamOverview,
  ModelTeamReadRepository,
  TeamQuestionRepository,
  TeamQuestionRow,
  TeamReportRepository,
  TeamReportRow,
  UserModelTeamRepository,
  WorkerHeartbeatRepository,
} from '../../../packages/database/src/index.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';
import { readDuelGroupId } from '../../../packages/model-agents/src/index.js';
import { parseJsonContainer } from '../../../packages/run-recording/src/index.js';
import type { InMemoryRuns } from './in-memory-runs.fixture.js';

const ON_DEMAND_DAY = (now: number): string => new Date(now).toISOString().slice(0, 10);

export const EMPTY_OVERVIEW: ModelTeamOverview = {
  latest: [],
  onDemand: [],
  scores: [],
  spend: [],
  failures: [],
};

export type OverviewCall = Parameters<ModelTeamReadRepository['readOverview']>[0];

export type EnqueuedOpinion = Parameters<TeamReportRepository['enqueueOnDemandReport']>[0] & {
  readonly id: string;
};

export type StoredQuestion = TeamQuestionRow & {
  readonly userId: string;
  readonly runId: string;
  readonly day: string;
};

export type InMemoryModelTeams = {
  readonly teams: Pick<UserModelTeamRepository, 'listTeams' | 'setEnabled' | 'claimOnDemand'>;
  readonly heartbeat: Pick<WorkerHeartbeatRepository, 'findLatest'>;
  readonly reads: Pick<ModelTeamReadRepository, 'readOverview' | 'listReportsForCandles'>;
  readonly queue: Pick<TeamReportRepository, 'enqueueOnDemandReport'>;
  readonly duels: ModelDuelRepository;
  readonly questions: TeamQuestionRepository;
  // As perguntas livres gravadas, com o dono e a simulação (o teste também as muda, como o worker faria).
  readonly storedQuestions: StoredQuestion[];
  // O que o teste configura.
  readonly state: {
    overview: ModelTeamOverview;
    reportsByCandle: readonly TeamReportRow[];
    heartbeat: LatestWorkerHeartbeat | undefined;
    equityPoints: readonly (DuelEquityPoint & { readonly userId: string })[];
    closedTrades: ReadonlyMap<string, number>;
  };
  // O que o código chamou.
  readonly calls: {
    overview: OverviewCall[];
    enqueued: EnqueuedOpinion[];
    queries: string[];
  };
  readonly enable: (scope: OwnerScope, teamKey: string) => void;
};

const READY_SUMMARY = (teamKey: string): Record<string, unknown> => ({
  [teamKey]: {
    keyConfigured: true,
    modelConfigured: true,
    providerState: 'ready',
    circuitUntil: null,
  },
});

export function buildHeartbeat(summary: unknown, ageMilliseconds = 1_000): LatestWorkerHeartbeat {
  return {
    instanceId: 'worker-test',
    lastBeatAt: new Date(0),
    ageMilliseconds,
    modelTeams: parseJsonContainer(JSON.stringify(summary)),
  };
}

export function readyHeartbeat(teamKeys: readonly string[]): LatestWorkerHeartbeat {
  return buildHeartbeat(Object.assign({}, ...teamKeys.map(READY_SUMMARY)));
}

// Os repositórios das equipes de modelo em memória: o interruptor e o contador do dia por dono, o batimento do worker, as leituras
// públicas que o teste semeia e o que foi enfileirado. As execuções do duelo saem das execuções em memória do harness.
export function createInMemoryModelTeams(
  runs: Pick<InMemoryRuns, 'owned'>,
  now: () => number,
): InMemoryModelTeams {
  const enabled = new Map<string, Set<string>>();
  const counters = new Map<string, { day: string; count: number }>();
  const state: InMemoryModelTeams['state'] = {
    overview: EMPTY_OVERVIEW,
    reportsByCandle: [],
    heartbeat: undefined,
    equityPoints: [],
    closedTrades: new Map(),
  };
  const calls: InMemoryModelTeams['calls'] = { overview: [], enqueued: [], queries: [] };
  const enabledOf = (scope: OwnerScope): Set<string> => {
    const found = enabled.get(scope.ownerUserId) ?? new Set<string>();
    enabled.set(scope.ownerUserId, found);
    return found;
  };
  const teams: InMemoryModelTeams['teams'] = {
    listTeams: (scope) =>
      Promise.resolve([...enabledOf(scope)].map((teamKey) => ({ teamKey, isEnabled: true }))),
    setEnabled: (scope, params) => {
      const set = enabledOf(scope);
      if (params.isEnabled) set.add(params.teamKey);
      else set.delete(params.teamKey);
      return Promise.resolve();
    },
    claimOnDemand: (scope, params) => {
      const today = ON_DEMAND_DAY(now());
      const counter = counters.get(scope.ownerUserId);
      const used = counter?.day === today ? counter.count : 0;
      if (params.dailyLimit <= 0 || used >= params.dailyLimit) return Promise.resolve(false);
      counters.set(scope.ownerUserId, { day: today, count: used + 1 });
      return Promise.resolve(true);
    },
  };
  const storedQuestions: StoredQuestion[] = [];
  const questions: TeamQuestionRepository = {
    createQuestion: (scope, params) => {
      const day = ON_DEMAND_DAY(now());
      const used = storedQuestions.filter(
        (row) => row.userId === scope.ownerUserId && row.day === day,
      ).length;
      if (params.dailyLimit <= 0 || used >= params.dailyLimit) return Promise.resolve(undefined);
      const id = crypto.randomUUID();
      storedQuestions.push({
        id,
        userId: scope.ownerUserId,
        runId: params.runId,
        day,
        teamKey: params.teamKey,
        symbol: params.symbol,
        question: params.question,
        status: 'pending',
        answer: null,
        failureCode: null,
        costUsd: '0',
        requestedAt: now() + storedQuestions.length,
        decidedAt: null,
      });
      return Promise.resolve(id);
    },
    listQuestions: (scope, params) =>
      Promise.resolve(
        storedQuestions
          .filter((row) => row.userId === scope.ownerUserId && row.runId === params.runId)
          .sort((left, right) => right.requestedAt - left.requestedAt)
          .slice(0, params.limit),
      ),
  };
  const model: InMemoryModelTeams = {
    questions,
    storedQuestions,
    teams,
    heartbeat: {
      findLatest: () => {
        calls.queries.push('findLatest');
        return Promise.resolve(state.heartbeat);
      },
    },
    reads: {
      readOverview: (params) => {
        calls.overview.push(params);
        calls.queries.push('readOverview');
        return Promise.resolve(state.overview);
      },
      listReportsForCandles: (params) => {
        calls.queries.push('listReportsForCandles');
        return Promise.resolve(
          state.reportsByCandle.filter((row) => params.candleTimes.includes(row.candleTime)),
        );
      },
    },
    queue: {
      enqueueOnDemandReport: (params) => {
        const id = crypto.randomUUID();
        calls.enqueued.push({ ...params, id });
        return Promise.resolve(id);
      },
    },
    duels: {
      listDuelRuns: (scope, duelId) =>
        Promise.resolve(
          runs
            .owned()
            .filter(
              (stored) =>
                stored.userId === scope.ownerUserId &&
                stored.deletedAt === undefined &&
                readDuelGroupId(stored.record.request) === duelId,
            )
            .map((stored) => stored.record),
        ),
      readEquityCurves: (scope, runIds) =>
        Promise.resolve(
          state.equityPoints.filter(
            (point) => point.userId === scope.ownerUserId && runIds.includes(point.runId),
          ),
        ),
      countClosedTrades: (_scope, runIds) =>
        Promise.resolve(
          runIds.map((runId) => ({ runId, trades: state.closedTrades.get(runId) ?? 0 })),
        ),
    },
    state,
    calls,
    enable: (scope, teamKey): void => {
      enabledOf(scope).add(teamKey);
    },
  };
  return model;
}
