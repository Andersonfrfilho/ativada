// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { screen, waitFor } from '@testing-library/react';

import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import { buildEquityCsv, buildRun, buildStrategy, buildVersion } from './support/run-fixtures.js';
import { buildChartResponse, buildSummaryResponse } from './support/trade-chart-fixtures.js';

const CARD = { name: 'Preço e operações' } as const;

function detailRoutes(run: Record<string, unknown>): readonly FakeRoute[] {
  const base = `/v1/runs/${String(run['id'])}`;
  return [
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
    { method: 'GET', path: base, respond: (): Response => dataResponse(run) },
    {
      method: 'GET',
      path: `${base}/export.csv`,
      respond: (): Response =>
        new Response(buildEquityCsv(50), { headers: { 'Content-Type': 'text/csv' } }),
    },
    { method: 'GET', path: `${base}/windows`, respond: (): Response => pageResponse([]) },
    { method: 'GET', path: `${base}/trades`, respond: (): Response => pageResponse([]) },
    {
      method: 'GET',
      path: `${base}/chart`,
      respond: (): Response => dataResponse(buildChartResponse()),
    },
    {
      method: 'GET',
      path: `${base}/trade-summary`,
      respond: (): Response => dataResponse(buildSummaryResponse()),
    },
  ];
}

function open(run: Record<string, unknown>): RenderedApp {
  return renderApp({
    path: `/backtests/${String(run['id'])}`,
    isAuthenticated: true,
    routes: detailRoutes(run),
  });
}

function callsToTradeRoutes(app: RenderedApp, runId: string): number {
  return ['chart', 'trade-summary', 'trades'].reduce(
    (total, name) => total + app.fake.callsTo('GET', `/v1/runs/${runId}/${name}`).length,
    0,
  );
}

describe('rota do detalhe: cartão "Preço e operações"', () => {
  test('appears on a completed backtest, with summary, chart and table', async () => {
    const app = open(buildRun({ id: 'run-1', kind: 'backtest', status: 'completed' }));
    const card = await screen.findByRole('region', CARD);
    expect(await screen.findByText(/Você pagou 201,21 USDT/)).toBeDefined();
    expect(card.querySelector('[data-chart-item]')).not.toBeNull();
    expect(screen.getByText('Nenhuma operação no período.')).toBeDefined();
    expect(app.fake.callsTo('GET', '/v1/runs/run-1/chart')).toHaveLength(1);
  });

  test('appears on a completed walk-forward and reads the chart of that run (out of sample)', async () => {
    const app = open(buildRun({ id: 'run-wf', kind: 'walk_forward', status: 'completed' }));
    expect(await screen.findByRole('region', CARD)).toBeDefined();
    await waitFor(() =>
      expect(app.fake.callsTo('GET', '/v1/runs/run-wf/chart').length).toBeGreaterThan(0),
    );
    expect(app.fake.callsTo('GET', '/v1/runs/run-wf/trades').length).toBeGreaterThan(0);
  });

  test.each(['queued', 'running'])(
    'does not appear while the run is %s, and the progress of today stays',
    async (status) => {
      const app = open(
        buildRun({
          id: 'run-1',
          status,
          progress: 40,
          metrics: null,
          queuePosition: status === 'queued' ? { own: 1, overall: 1 } : null,
        }),
      );
      if (status === 'running') {
        expect(
          await screen.findByRole('progressbar', { name: 'Progresso da execução' }),
        ).toBeDefined();
      } else {
        expect(await screen.findByText(/Posição na fila: 1/)).toBeDefined();
      }
      expect(screen.queryByRole('region', CARD)).toBeNull();
      expect(callsToTradeRoutes(app, 'run-1')).toBe(0);
    },
  );

  test.each(['failed', 'cancelled'])('does not appear when the run %s', async (status) => {
    const app = open(buildRun({ id: 'run-1', status, metrics: null, errorCode: 'NO_CANDLES' }));
    if (status === 'cancelled') {
      const notice = await screen.findByText('Execução cancelada.');
      expect(notice.getAttribute('role')).toBe('status');
    } else {
      expect(await screen.findByRole('alert')).toBeDefined();
    }
    expect(screen.queryByRole('region', CARD)).toBeNull();
    expect(callsToTradeRoutes(app, 'run-1')).toBe(0);
  });
});
