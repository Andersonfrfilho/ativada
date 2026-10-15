// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { screen, waitFor, within } from '@testing-library/react';

import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';
import { buildRun, buildStrategy, buildVersion } from './support/run-fixtures.js';

function runsRoute(runVersionId: string): FakeRoute {
  return {
    method: 'GET',
    path: '/v1/runs',
    respond: (call): Response =>
      pageResponse(
        call.query.get('kind') === 'backtest'
          ? [buildRun({ id: 'run-1', strategyVersionId: runVersionId })]
          : [],
      ),
  };
}

function versionsRoute(strategyId: string, versionId: string): FakeRoute {
  return {
    method: 'GET',
    path: `/v1/strategies/${strategyId}/versions`,
    respond: (): Response => pageResponse([buildVersion({ id: versionId, strategyId })]),
  };
}

async function backtestsRegion(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Backtests' });
}

describe('which strategy a run came from', () => {
  test('says it is loading, never "removida", while the index is still being read', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        runsRoute('version-1'),
        {
          method: 'GET',
          path: '/v1/strategies',
          respond: async (): Promise<Response> => {
            await gate;
            return pageResponse([buildStrategy()]);
          },
        },
        versionsRoute('strategy-1', 'version-1'),
      ],
    });
    const region = await backtestsRegion();
    await waitFor(() => expect(region.textContent).toContain('BTC/USDT'));
    expect(region.textContent).toContain('Carregando estratégia');
    expect(region.textContent).not.toContain('Estratégia removida');
    release();
    await waitFor(() => expect(region.textContent).toContain('Placar clássico · versão 1'));
  });

  test('a failed strategy list says "indisponível", not "removida"', async () => {
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        runsRoute('version-1'),
        {
          method: 'GET',
          path: '/v1/strategies',
          respond: (): Response => errorResponse(500, 'BOOM'),
        },
      ],
    });
    const region = await backtestsRegion();
    await waitFor(() => expect(region.textContent).toContain('Estratégia indisponível agora'));
    expect(region.textContent).not.toContain('Estratégia removida');
  });

  test('one strategy whose versions fail does not take the others down', async () => {
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        runsRoute('version-1'),
        {
          method: 'GET',
          path: '/v1/strategies',
          respond: (): Response =>
            pageResponse([buildStrategy(), buildStrategy({ id: 'strategy-2', name: 'Outra' })]),
        },
        versionsRoute('strategy-1', 'version-1'),
        {
          method: 'GET',
          path: '/v1/strategies/strategy-2/versions',
          respond: (): Response => errorResponse(500, 'BOOM'),
        },
      ],
    });
    const region = await backtestsRegion();
    await waitFor(() => expect(region.textContent).toContain('Placar clássico · versão 1'));
  });

  test('a run whose strategy is in the part that failed is "indisponível", and a truly unknown one is "removida"', async () => {
    const strategies = pageResponse([buildStrategy({ id: 'strategy-2', name: 'Outra' })]);
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        runsRoute('version-9'),
        { method: 'GET', path: '/v1/strategies', respond: (): Response => strategies.clone() },
        {
          method: 'GET',
          path: '/v1/strategies/strategy-2/versions',
          respond: (): Response => errorResponse(500, 'BOOM'),
        },
      ],
    });
    const region = await backtestsRegion();
    await waitFor(() => expect(region.textContent).toContain('Estratégia indisponível agora'));
    expect(region.textContent).not.toContain('Estratégia removida');
  });

  test('a run of a strategy that really is gone says "removida" once the index is complete', async () => {
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        runsRoute('version-9'),
        {
          method: 'GET',
          path: '/v1/strategies',
          respond: (): Response => pageResponse([buildStrategy()]),
        },
        versionsRoute('strategy-1', 'version-1'),
      ],
    });
    const region = await backtestsRegion();
    await waitFor(() => expect(region.textContent).toContain('Estratégia removida'));
  });

  test('follows the cursor past the first 100 strategies', async () => {
    const first = Array.from({ length: 100 }, (_unused, index) =>
      buildStrategy({ id: `strategy-a${index}`, name: `A${index}` }),
    );
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        runsRoute('version-1'),
        {
          method: 'GET',
          path: '/v1/strategies',
          respond: (call): Response =>
            call.query.get('cursor') === null
              ? pageResponse(first, 'next-1')
              : pageResponse([buildStrategy()]),
        },
        ...first.map((strategy) => ({
          method: 'GET',
          path: `/v1/strategies/${String(strategy['id'])}/versions`,
          respond: (): Response => pageResponse([]),
        })),
        versionsRoute('strategy-1', 'version-1'),
      ],
    });
    const region = await backtestsRegion();
    await waitFor(() =>
      expect(within(region).queryAllByText(/Placar clássico · versão 1/).length).toBeGreaterThan(0),
    );
  });

  test('the detail header follows the same rule', async () => {
    renderApp({
      path: '/backtests/run-1',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/runs/run-1',
          respond: (): Response => dataResponse(buildRun({ id: 'run-1' })),
        },
        {
          method: 'GET',
          path: '/v1/strategies',
          respond: (): Response => errorResponse(500, 'BOOM'),
        },
      ],
    });
    await waitFor(() =>
      expect(document.body.textContent).toContain('Estratégia indisponível agora'),
    );
    expect(document.body.textContent).not.toContain('Estratégia removida');
  });
});
