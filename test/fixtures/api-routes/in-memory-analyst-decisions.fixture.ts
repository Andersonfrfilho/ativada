// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AnalystDecisionRecord,
  AnalystDecisionRepository,
  EquityPointInput,
  PositionInput,
} from '../../../packages/database/src/index.js';
import type { OwnerScope } from '../../../packages/database/src/ownership/owner-scope.js';

const PAGE_MAXIMUM = 100;

export type InMemoryAnalystParams = {
  readonly isOwned: (scope: OwnerScope, runId: string) => boolean;
  readonly resultsOf: (runId: string) => {
    readonly equity: readonly EquityPointInput[];
    readonly positions: readonly PositionInput[];
  };
  // Cada leitura anota o nome aqui: o teste conta as consultas de um pedido.
  readonly calls: string[];
};

export type InMemoryAnalystDecisions = {
  readonly repository: Pick<
    AnalystDecisionRepository,
    'findLatestAnalystDecision' | 'listAnalystDecisionsPage' | 'readAnalystGoalSnapshot'
  >;
  readonly seed: (runId: string, rows: readonly AnalystDecisionRecord[]) => void;
};

// As leituras do analista sobre listas em memória, com a semântica do Postgres: filtro de dono em cada uma e decrescente
// por vela.
export function createInMemoryAnalystDecisions(
  params: InMemoryAnalystParams,
): InMemoryAnalystDecisions {
  const { isOwned, resultsOf, calls } = params;
  const stores = new Map<string, AnalystDecisionRecord[]>();
  const newestFirst = (runId: string): AnalystDecisionRecord[] =>
    [...(stores.get(runId) ?? [])].sort((left, right) => right.candleTime - left.candleTime);

  const repository: InMemoryAnalystDecisions['repository'] = {
    findLatestAnalystDecision: (scope, runId) => {
      calls.push('findLatestAnalystDecision');
      return Promise.resolve(isOwned(scope, runId) ? newestFirst(runId)[0] : undefined);
    },
    listAnalystDecisionsPage: (scope, request) => {
      calls.push('listAnalystDecisionsPage');
      if (!isOwned(scope, request.runId)) {
        return Promise.resolve({ decisions: [], nextCursor: undefined });
      }
      const limit = Math.min(Math.max(Math.trunc(request.limit), 1), PAGE_MAXIMUM);
      const { before } = request;
      const rows = newestFirst(request.runId).filter(
        (row) => before === undefined || row.candleTime < before,
      );
      const page = rows.slice(0, limit);
      return Promise.resolve({
        decisions: page,
        nextCursor: rows.length > limit ? page.at(-1)?.candleTime : undefined,
      });
    },
    readAnalystGoalSnapshot: (scope, runId) => {
      calls.push('readAnalystGoalSnapshot');
      if (!isOwned(scope, runId))
        return Promise.resolve({ latestEquity: undefined, closedPositions: 0 });
      const { equity, positions } = resultsOf(runId);
      const latest = [...equity].sort((left, right) => right.candleTime - left.candleTime)[0];
      return Promise.resolve({
        latestEquity: latest?.equity,
        closedPositions: positions.filter((position) => position.status === 'closed').length,
      });
    },
  };

  return {
    repository,
    seed: (runId, rows): void => {
      stores.set(runId, [...(stores.get(runId) ?? []), ...rows]);
    },
  };
}
