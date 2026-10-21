// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Duel } from '../../src/runs/duel/duel.validation.js';
import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './fake-fetch.js';
import { buildScoreboard } from './model-teams-fixtures.js';

export const DUEL_ID = 'duel-1';
const START = 1_760_000_000_000 - (1_760_000_000_000 % 900_000);

function duelRun(runId: string, team: 'nina' | 'lucas' | 'olivia' | null): Duel['runs'][number] {
  return {
    runId,
    team,
    signalSource: team === null ? null : { kind: 'model_team', team },
    status: 'running',
    lastCandleTime: START,
    createdAt: '2026-10-17T12:00:00.000Z',
  };
}

export function buildDuel(overrides: Partial<Duel> = {}): Duel {
  return {
    duelId: DUEL_ID,
    symbol: 'BTCUSDT',
    notice: 'Mesmo par, mesma vela e mesmo saldo fictício. Período curto não prova nada.',
    comparisonNotice:
      'Comparação de acerto do lado da próxima vela; não mede lucro e não é recomendação.',
    runs: [duelRun('run-n', 'nina'), duelRun('run-l', 'lucas'), duelRun('run-r', null)],
    candleTimes: [START, START + 900_000, START + 1_800_000],
    curves: [
      { runId: 'run-n', equity: ['10000.00000000', '10100.00000000', '10250.50000000'] },
      { runId: 'run-l', equity: ['10000.00000000', null, '9900.00000000'] },
      { runId: 'run-r', equity: ['10000.00000000', '10010.00000000', '10020.00000000'] },
    ],
    ranking: [
      {
        runId: 'run-l',
        team: 'lucas',
        returnRate: '-0.01000000',
        maxDrawdown: '0.01500000',
        trades: 2,
        scoreboard: buildScoreboard(),
        apiCost: { todayUsd: '0.02180000', monthUsd: '0.65400000' },
      },
      {
        runId: 'run-n',
        team: 'nina',
        returnRate: '0.02505000',
        maxDrawdown: '0.05011000',
        trades: 3,
        scoreboard: buildScoreboard({
          hits: 20,
          counted: 30,
          verdict: 'above',
          hitRate: '0.66666667',
          lower: '0.48800000',
          upper: '0.80000000',
        }),
        apiCost: { todayUsd: '0.01090000', monthUsd: '0.32700000' },
      },
      {
        runId: 'run-r',
        team: null,
        returnRate: '0.00200000',
        maxDrawdown: '0.00000000',
        trades: 1,
        scoreboard: null,
        apiCost: null,
      },
    ],
    ...overrides,
  };
}

export function duelRoute(duel: Duel | 'missing'): FakeRoute {
  return {
    method: 'GET',
    path: `/v1/model-duels/${DUEL_ID}`,
    respond: (): Response =>
      duel === 'missing' ? errorResponse(404, 'DUEL_NOT_FOUND') : dataResponse(duel),
  };
}

export type CreatedBodies = { readonly bodies: unknown[]; failWith: string | undefined };

export function createDuelRoutes(created: CreatedBodies): readonly FakeRoute[] {
  return [
    {
      method: 'POST',
      path: '/v1/model-duels',
      respond: (call): Response => {
        created.bodies.push(call.body);
        if (created.failWith !== undefined) return errorResponse(409, created.failWith);
        return dataResponse(
          {
            duelId: DUEL_ID,
            symbol: 'BTCUSDT',
            timeframe: '15m',
            runs: [duelRun('run-n', 'nina')],
          },
          201,
        );
      },
    },
    {
      method: 'GET',
      path: '/v1/strategies',
      respond: (): Response =>
        pageResponse([
          {
            id: 's1',
            name: 'Placar clássico',
            isExample: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
    },
    {
      method: 'GET',
      path: '/v1/strategies/s1/versions',
      respond: (): Response =>
        pageResponse([
          {
            id: 'v1',
            strategyId: 's1',
            version: 1,
            config: {},
            configHash: 'hash',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
    },
  ];
}
