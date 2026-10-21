// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import {
  createRefetchScheduler,
  isDecisionsKey,
  isProjectionsPageKey,
  REFETCH_DEBOUNCE_MILLISECONDS,
} from '../src/live/refetch-scheduler.js';
import {
  useDecisionsQuery,
  useLiveStatusQuery,
} from '../src/runs/live-tracking/live-status.query.js';
import {
  decisionSchema,
  liveStatusSchema,
} from '../src/runs/live-tracking/live-status.validation.js';
import { tradeChartSchema } from '../src/runs/trade-chart.validation.js';
import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { buildDecisionResponse, buildLiveStatusResponse } from './support/live-status-fixtures.js';
import { renderApp } from './support/render-app.js';
import { buildChartResponse } from './support/trade-chart-fixtures.js';

function StatusProbe(): ReactElement {
  const status = useLiveStatusQuery('run-1', true);
  const queryClient = useQueryClient();
  const keys = queryClient
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey.map(String).join('/'));
  return (
    <p>
      {status.isSuccess ? `saldo:${status.data.balance.current}` : status.status}|{keys.join(',')}
    </p>
  );
}

function DecisionsProbe(): ReactElement {
  const decisions = useDecisionsQuery('run-1', true);
  const queryClient = useQueryClient();
  const keys = queryClient
    .getQueryCache()
    .getAll()
    .map((query) => String(query.queryKey[0]));
  const count = decisions.data?.pages[0]?.items.length;
  return (
    <p>
      {decisions.isSuccess ? `decisoes:${count}` : decisions.status}|{keys.join(',')}
    </p>
  );
}

function statusRoute(body: unknown): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: '/v1/runs/run-1/live-status',
      respond: (): Response => dataResponse(body),
    },
  ];
}

function buildBalance(current: unknown): Record<string, unknown> {
  return { ...(buildLiveStatusResponse().balance as object), current };
}

describe('live status schema', () => {
  test('accepts the server shape with and without goal, position and trigger rules', () => {
    expect(liveStatusSchema.safeParse(buildLiveStatusResponse()).success).toBe(true);
    const full = buildLiveStatusResponse({
      goal: {
        targetRate: '0.1',
        targetAmount: '1100',
        remainingAmount: '69.5',
        remainingRate: '0.0695',
        deadlineAt: 1_767_900_000_000,
        remainingMilliseconds: 600_000,
        maxLossRate: '0.05',
        floorAmount: '950',
        lossRoomAmount: '80.5',
        outcome: null,
        outcomeAt: null,
        message: 'Falta 69,50 USDT.',
      },
      openPosition: {
        entryPrice: '100',
        quantity: '2',
        targetPrice: '110',
        stopPrice: '95',
        openedCandleTime: 1,
      },
    });
    expect(liveStatusSchema.safeParse(full).success).toBe(true);
  });

  test('accepts the unavailable trigger variant', () => {
    const triggers = { status: 'unavailable', reason: 'no_candle', message: 'Aguardando.' };
    expect(liveStatusSchema.safeParse(buildLiveStatusResponse({ triggers })).success).toBe(true);
  });

  test('rejects money as a number, a made-up outcome and an unknown trigger status', () => {
    const balance = buildBalance(1030.5);
    expect(liveStatusSchema.safeParse(buildLiveStatusResponse({ balance })).success).toBe(false);
    const decision = buildDecisionResponse({ outcome: 'hesitated' });
    expect(decisionSchema.safeParse(decision).success).toBe(false);
    const triggers = { status: 'maybe', message: 'x' };
    expect(liveStatusSchema.safeParse(buildLiveStatusResponse({ triggers })).success).toBe(false);
  });

  test('rejects scientific notation, NaN and a vote outside -1, 0, 1', () => {
    expect(decisionSchema.safeParse(buildDecisionResponse({ close: '1e5' })).success).toBe(false);
    expect(decisionSchema.safeParse(buildDecisionResponse({ score: 'NaN' })).success).toBe(false);
    const votes = [{ ...(buildDecisionResponse().votes as object[])[0], vote: 2 }];
    expect(decisionSchema.safeParse(buildDecisionResponse({ votes })).success).toBe(false);
  });
});

describe('chart decisions', () => {
  const decision = {
    candleTime: 1,
    closedAt: 2,
    action: 'HOLD' as const,
    outcome: 'waited' as const,
    score: '1',
    scoreThreshold: '2',
  };

  test('the chart accepts decisions, a null and an old response without the field', () => {
    const withDecisions = tradeChartSchema.parse(buildChartResponse({ decisions: [decision] }));
    expect(withDecisions.decisions).toEqual([decision]);
    expect(tradeChartSchema.parse(buildChartResponse({ decisions: null })).decisions).toBeNull();
    expect(tradeChartSchema.parse(buildChartResponse()).decisions).toBeNull();
  });

  test('the chart and the table accept the pending buy and the exit outcomes', () => {
    for (const outcome of ['buy_pending', 'exited'] as const) {
      const chart = buildChartResponse({ decisions: [{ ...decision, outcome }] });
      expect(tradeChartSchema.safeParse(chart).success).toBe(true);
      expect(decisionSchema.safeParse(buildDecisionResponse({ outcome })).success).toBe(true);
    }
  });

  test('the chart refuses a decision with a bad outcome or a numeric score', () => {
    const badOutcome = [{ ...decision, outcome: 'x' }];
    const badScore = [{ ...decision, score: 1 }];
    expect(tradeChartSchema.safeParse(buildChartResponse({ decisions: badOutcome })).success).toBe(
      false,
    );
    expect(tradeChartSchema.safeParse(buildChartResponse({ decisions: badScore })).success).toBe(
      false,
    );
  });
});

describe('o aviso do stream vira uma rebusca só', () => {
  function createSpiedClient(): { client: QueryClient; calls: unknown[] } {
    const client = new QueryClient();
    const calls: unknown[] = [];
    const original = client.invalidateQueries.bind(client);
    client.invalidateQueries = (filters, options): Promise<void> => {
      calls.push(filters);
      return original(filters, options);
    };
    return { client, calls };
  }

  test('a burst of notices of the same subject is one invalidation, 500 ms after the last', async () => {
    const { client, calls } = createSpiedClient();
    const scheduler = createRefetchScheduler(client);
    scheduler.schedule('runs');
    scheduler.schedule('runs');
    scheduler.schedule('runs');
    expect(calls).toHaveLength(0);
    await new Promise((resolve) => setTimeout(resolve, REFETCH_DEBOUNCE_MILLISECONDS + 100));
    expect(calls).toHaveLength(2);
    scheduler.cancel();
  });

  test('old pages of decisions are only marked stale, never refetched', async () => {
    const { client, calls } = createSpiedClient();
    const scheduler = createRefetchScheduler(client);
    scheduler.schedule('runs');
    await new Promise((resolve) => setTimeout(resolve, REFETCH_DEBOUNCE_MILLISECONDS + 100));
    const [others, decisions] = calls as { refetchType?: string }[];
    expect(others?.refetchType).toBeUndefined();
    expect(decisions?.refetchType).toBe('none');
    expect(isDecisionsKey(['runs', 'run-1', 'decisions'])).toBe(true);
    expect(isDecisionsKey(['runs', 'run-1', 'live-status'])).toBe(false);
    expect(isDecisionsKey(['runs'])).toBe(false);
    // As páginas por cursor das previsões seguem a mesma regra; a primeira página (sem cursor) é refeita.
    expect(isProjectionsPageKey(['runs', 'run-1', 'projections', 'c1', undefined])).toBe(true);
    expect(isProjectionsPageKey(['runs', 'run-1', 'projections', undefined, undefined])).toBe(
      false,
    );
    expect(isProjectionsPageKey(['runs', 'run-1', 'live-status', 'c1'])).toBe(false);
    scheduler.cancel();
  });

  test('cancel drops the pending refetch', async () => {
    const { client, calls } = createSpiedClient();
    const scheduler = createRefetchScheduler(client);
    scheduler.schedule('runs');
    scheduler.cancel();
    await new Promise((resolve) => setTimeout(resolve, REFETCH_DEBOUNCE_MILLISECONDS + 100));
    expect(calls).toHaveLength(0);
  });
});

describe('live status queries', () => {
  test('the live status key starts with "runs"', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: statusRoute(buildLiveStatusResponse()),
      probe: <StatusProbe />,
    });
    expect(await screen.findByText(/saldo:1030.5/)).toBeDefined();
    expect(screen.getByText(/\|runs\/run-1\/live-status$/)).toBeDefined();
  });

  test('an invalid live status renders nothing from the data', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: statusRoute(buildLiveStatusResponse({ balance: buildBalance('NaN') })),
      probe: <StatusProbe />,
    });
    expect(await screen.findByText(/^error/)).toBeDefined();
    expect(screen.queryByText(/saldo:/)).toBeNull();
  });

  test('the decisions query asks for 48 on the first page (the 24 newest are already in live-status) and 24 after, and its key starts with "runs"', async () => {
    const routes: readonly FakeRoute[] = [
      {
        method: 'GET',
        path: '/v1/runs/run-1/decisions',
        respond: (): Response => pageResponse([buildDecisionResponse()], 'cursor-2'),
      },
    ];
    const { fake } = renderApp({
      path: '/',
      isAuthenticated: true,
      routes,
      probe: <DecisionsProbe />,
    });
    expect(await screen.findByText('decisoes:1|runs')).toBeDefined();
    const query = fake.callsTo('GET', '/v1/runs/run-1/decisions')[0]?.query;
    expect([query?.get('limit'), query?.get('cursor')]).toEqual(['48', null]);
  });

  test('an invalid decision page ends in error', async () => {
    const routes: readonly FakeRoute[] = [
      {
        method: 'GET',
        path: '/v1/runs/run-1/decisions',
        respond: (): Response => pageResponse([buildDecisionResponse({ close: 'x' })]),
      },
    ];
    renderApp({ path: '/', isAuthenticated: true, routes, probe: <DecisionsProbe /> });
    expect(await screen.findByText(/^error/)).toBeDefined();
  });
});
