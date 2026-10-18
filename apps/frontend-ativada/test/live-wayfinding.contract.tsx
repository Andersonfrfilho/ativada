// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { screen, waitFor, within } from '@testing-library/react';

import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { createLiveHarness, liveRoutes, LIVE_RUN_ID } from './support/live-tracking-harness.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import { buildRun, buildStrategy, buildVersion } from './support/run-fixtures.js';
import { buildChartResponse, buildSummaryResponse } from './support/trade-chart-fixtures.js';

const BANNER_TEXT = 'A equipe de modelos e os avisos em tempo real ficam nas simulações ao vivo.';

function liveItem(id: string, symbol: string, status: string): Record<string, unknown> {
  return buildRun({
    id,
    kind: 'live_paper',
    status,
    symbol,
    periodEnd: null,
    metrics: null,
    progress: 0,
    goalId: null,
  });
}

function listRoutes(items: readonly unknown[]): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: '/v1/runs',
      respond: (call): Response =>
        pageResponse(call.query.get('kind') === 'live_paper' ? items : []),
    },
    {
      method: 'GET',
      path: '/v1/runs/live-summary',
      respond: (): Response => dataResponse({ items: [] }),
    },
  ];
}

function historicRoutes(run: Record<string, unknown>): readonly FakeRoute[] {
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
    ...listRoutes([]),
  ];
}

function openHistoric(kind: string): RenderedApp {
  const run = buildRun({ id: 'run-h', kind, status: 'completed' });
  return renderApp({
    path: '/backtests/run-h',
    isAuthenticated: true,
    routes: historicRoutes(run),
  });
}

function openLive(): RenderedApp {
  const harness = createLiveHarness();
  return renderApp({
    path: `/backtests/${LIVE_RUN_ID}`,
    isAuthenticated: true,
    routes: [...liveRoutes(harness), ...listRoutes([harness.run])],
  });
}

async function mainArea(): Promise<HTMLElement> {
  return screen.findByRole('main');
}

describe('item de menu "Ao vivo"', () => {
  test('aparece no menu principal, leva a /ao-vivo e conta só as que estão rodando', async () => {
    const items = [
      liveItem('a', 'BTCUSDT', 'running'),
      liveItem('b', 'ETHUSDT', 'running'),
      liveItem('c', 'SOLUSDT', 'queued'),
    ];
    renderApp({ path: '/conta', isAuthenticated: true, routes: listRoutes(items) });
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    const link = within(nav).getByRole('link', { name: /Ao vivo/ });
    expect(link.getAttribute('href')).toBe('/ao-vivo');
    await waitFor(() => expect(link.textContent).toContain('2'));
    expect(within(link).getByLabelText('2 rodando agora')).toBeDefined();
  });

  test('sem simulação rodando não mostra contador', async () => {
    renderApp({ path: '/conta', isAuthenticated: true, routes: listRoutes([]) });
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    const link = within(nav).getByRole('link', { name: /Ao vivo/ });
    await waitFor(() => expect(link.textContent).toBe('Ao vivo'));
  });
});

describe('página /ao-vivo', () => {
  test('lista as simulações ao vivo, cada uma com link para o detalhe', async () => {
    const items = [liveItem('a', 'BTCUSDT', 'running'), liveItem('b', 'ETHUSDT', 'running')];
    const app = renderApp({ path: '/ao-vivo', isAuthenticated: true, routes: listRoutes(items) });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Simulações ao vivo' }),
    ).toBeDefined();
    const list = await screen.findByRole('list', { name: 'Simulações ao vivo' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toStrictEqual([
      '/backtests/a',
      '/backtests/b',
    ]);
    expect(within(list).getAllByText('Rodando')).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Filtrar por moeda' })).toBeDefined();
    const calls = app.fake.callsTo('GET', '/v1/runs');
    expect(calls.every((call) => call.query.get('kind') === 'live_paper')).toBe(true);
  });

  test('sem nenhuma, explica e aponta onde iniciar', async () => {
    renderApp({ path: '/ao-vivo', isAuthenticated: true, routes: listRoutes([]) });
    expect(await screen.findByText('Nenhuma simulação ao vivo agora.')).toBeDefined();
  });
});

describe('faixa de backtest e selo ao vivo', () => {
  test('backtest concluído mostra a faixa com o botão para as simulações ao vivo', async () => {
    openHistoric('backtest');
    const note = await screen.findByRole('note', { name: 'Execução histórica' });
    expect(note.textContent).toContain('Isto é um backtest (histórico).');
    expect(note.textContent).toContain(BANNER_TEXT);
    const button = within(note).getByRole('link', { name: 'Ver simulações ao vivo' });
    expect(button.getAttribute('href')).toBe('/ao-vivo');
    const main = within(await mainArea());
    expect(main.queryByText('Ao vivo')).toBeNull();
  });

  test('walk-forward também mostra a faixa, com o nome certo', async () => {
    openHistoric('walk_forward');
    const note = await screen.findByRole('note', { name: 'Execução histórica' });
    expect(note.textContent).toContain('Isto é um walk-forward (histórico).');
  });

  test('simulação ao vivo mostra o selo "Ao vivo" e nenhuma faixa de backtest', async () => {
    openLive();
    const main = within(await mainArea());
    expect(await main.findByText('Ao vivo')).toBeDefined();
    expect(screen.queryByRole('note', { name: 'Execução histórica' })).toBeNull();
    expect(main.queryByRole('link', { name: 'Ver simulações ao vivo' })).toBeNull();
  });
});

describe('título da lista de backtests', () => {
  test('diz que é histórico', async () => {
    renderApp({ path: '/backtests', isAuthenticated: true, routes: listRoutes([]) });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Backtests (histórico)' }),
    ).toBeDefined();
  });
});
