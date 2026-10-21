// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { screen, within } from '@testing-library/react';

import { groupRuns, summarizeGroup } from '../src/backtests/run-groups.js';
import { runSchema } from '../src/runs/run.validation.js';
import { pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { createLiveHarness, liveRoutes, LIVE_RUN_ID } from './support/live-tracking-harness.js';
import { renderApp } from './support/render-app.js';
import {
  buildMetrics,
  buildRun,
  buildStrategy,
  buildVersion,
  metricValue,
} from './support/run-fixtures.js';

function run(
  id: string,
  version: string,
  symbol: string,
  totalReturn: string,
): ReturnType<typeof runSchema.parse> {
  return runSchema.parse(
    buildRun({
      id,
      strategyVersionId: version,
      symbol,
      metrics: buildMetrics({ totalReturn: metricValue(totalReturn) }),
    }),
  );
}

describe('agrupar backtests por estratégia', () => {
  const runs = [
    run('a', 'version-1', 'BTCUSDT', '0.042'),
    run('b', 'version-1', 'ETHUSDT', '-0.011'),
    run('c', 'version-2', 'SOLUSDT', '0'),
  ];

  test('groups what is loaded by version, best result first', () => {
    const groups = groupRuns(runs);
    expect(groups.map((group) => group.key)).toEqual(['version-1', 'version-2']);
    expect(groups[0]?.runs.map((item) => item.run.id)).toEqual(['a', 'b']);
  });

  test('summarises positives, median, best and worst', () => {
    const [first] = groupRuns(runs);
    const summary = summarizeGroup(first ?? { key: '', runs: [] });
    expect(summary.measuredCount).toBe(2);
    expect(summary.positiveCount).toBe(1);
    expect(summary.median).toBe(1_550_000n);
    expect(summary.best?.run.symbol).toBe('BTCUSDT');
    expect(summary.worst?.run.symbol).toBe('ETHUSDT');
  });
});

const STRATEGY_ROUTES: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/v1/strategies',
    respond: (): Response => pageResponse([buildStrategy()]),
  },
  {
    method: 'GET',
    path: '/v1/strategies/strategy-1/versions',
    respond: (): Response => pageResponse([buildVersion()]),
  },
];

describe('lista de backtests agrupada', () => {
  test('a collapsible group per strategy with the summary, a checkbox column and result with arrow and sign', async () => {
    const list = [
      buildRun({ id: 'a', symbol: 'BTCUSDT' }),
      buildRun({
        id: 'b',
        symbol: 'ETHUSDT',
        metrics: buildMetrics({ totalReturn: metricValue('-0.011') }),
      }),
      buildRun({
        id: 'c',
        symbol: 'SOLUSDT',
        metrics: buildMetrics({ totalReturn: metricValue('0') }),
      }),
    ];
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        ...STRATEGY_ROUTES,
        {
          method: 'GET',
          path: '/v1/runs',
          respond: (call): Response =>
            pageResponse(call.query.get('kind') === 'backtest' ? list : []),
        },
      ],
    });
    const card = await screen.findByRole('region', { name: 'Backtests' });
    expect(await within(card).findByText('1 de 3 positivos')).toBeDefined();
    expect(within(card).getByText(/mediana \+0,00%|mediana \+1,55%|mediana 0,00%/)).toBeDefined();
    expect(within(card).getByText('+4,20%')).toBeDefined();
    expect(within(card).getByText('−1,10%')).toBeDefined();
    expect(within(card).getByText('= 0,00%')).toBeDefined();
    const groups = card.querySelectorAll('details');
    expect(groups).toHaveLength(1);
    expect(within(card).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(card).getByRole('columnheader', { name: /Resultado/ })).toBeDefined();
  });
});

describe('cartão da simulação ao vivo em Backtests', () => {
  test('shows the running simulation on top with the pulse line and a link to the tracking', async () => {
    const harness = createLiveHarness();
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        ...liveRoutes(harness).filter((route) => route.path !== '/v1/strategies'),
        ...STRATEGY_ROUTES,
        {
          method: 'GET',
          path: '/v1/runs',
          respond: (call): Response =>
            pageResponse(call.query.get('kind') === 'live_paper' ? [harness.run] : []),
        },
      ],
    });
    const card = await screen.findByRole('region', { name: 'Simulação ao vivo' });
    expect(
      await within(card).findByRole('region', { name: 'Simulação rodando agora' }),
    ).toBeDefined();
    const link = within(card).getByRole('link', { name: 'Acompanhar' });
    expect(link.getAttribute('href')).toBe(`/backtests/${LIVE_RUN_ID}#acompanhamento`);
  });
});
