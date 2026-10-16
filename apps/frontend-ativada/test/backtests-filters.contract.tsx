// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import { buildRun, buildStrategy, buildVersion } from './support/run-fixtures.js';

const BITCOIN_FIRST_PAGE = [
  buildRun({ id: 'btc-1', symbol: 'BTCUSDT' }),
  buildRun({ id: 'btc-2', symbol: 'BTCUSDT' }),
];
const BITCOIN_SECOND_PAGE = [buildRun({ id: 'btc-3', symbol: 'BTCUSDT' })];
const ETHEREUM = [buildRun({ id: 'eth-1', symbol: 'ETHUSDT' })];

const ROUTES: readonly FakeRoute[] = [
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
  {
    method: 'GET',
    path: '/v1/runs',
    respond: (call): Response => {
      if (call.query.get('kind') !== 'backtest') return pageResponse([]);
      const symbol = call.query.get('symbol');
      if (symbol === 'ETHUSDT') return pageResponse(ETHEREUM);
      if (symbol === 'BTCUSDT') {
        return call.query.get('cursor') === 'next'
          ? pageResponse(BITCOIN_SECOND_PAGE)
          : pageResponse(BITCOIN_FIRST_PAGE, 'next');
      }
      return pageResponse([...BITCOIN_FIRST_PAGE, ...ETHEREUM]);
    },
  },
];

async function openPage(path = '/backtests'): Promise<{ app: RenderedApp; card: HTMLElement }> {
  const app = renderApp({ path, isAuthenticated: true, routes: ROUTES });
  const card = await screen.findByRole('region', { name: 'Backtests' });
  await within(card).findByText(/no total|carregadas/);
  return { app, card };
}

function rowCount(card: HTMLElement): number {
  return card.querySelectorAll('tbody tr').length;
}

describe('filtro por moeda e tipo na lista de backtests', () => {
  test('chips list every enabled pair and none is filtered at first', async () => {
    const { app } = await openPage();
    const group = await screen.findByRole('group', { name: 'Filtrar por moeda' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(
      within(group).getByRole('button', { name: 'Todas as moedas' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(app.fake.callsTo('GET', '/v1/runs')[0]?.query.has('symbol')).toBe(false);
  });

  test('choosing a pair sends it to the API, writes par to the URL and shows only that pair', async () => {
    const { app, card } = await openPage();
    fireEvent.click(screen.getByRole('button', { name: 'ETH' }));
    await waitFor(() => expect(rowCount(card)).toBe(1));
    expect(new URLSearchParams(app.router.state.location.search).get('par')).toBe('ETHUSDT');
    const sent = app.fake.callsTo('GET', '/v1/runs').map((call) => call.query.get('symbol'));
    expect(sent).toContain('ETHUSDT');
    expect(within(card).getByText('1 no total')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Todas as moedas' }));
    await waitFor(() => expect(rowCount(card)).toBe(3));
    expect(new URLSearchParams(app.router.state.location.search).has('par')).toBe(false);
  });

  test('load more keeps the filter and the count says loaded while there is more', async () => {
    const { card } = await openPage('/backtests?par=BTCUSDT');
    await waitFor(() => expect(rowCount(card)).toBe(2));
    expect(within(card).getByText('2 carregadas · há mais')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Carregar mais backtests' }));
    await waitFor(() => expect(rowCount(card)).toBe(3));
    expect(within(card).getByText('3 no total')).toBeTruthy();
  });

  test('a pair that is not enabled in the URL is ignored', async () => {
    const { card } = await openPage('/backtests?par=DOGEUSDT');
    expect(rowCount(card)).toBe(3);
  });

  test('the kind filter hides the other list and goes to the URL', async () => {
    const app = renderApp({
      path: '/backtests?tipo=walk_forward',
      isAuthenticated: true,
      routes: ROUTES,
    });
    await screen.findByRole('region', { name: 'Walk-forward' });
    expect(screen.queryByRole('region', { name: 'Backtests' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    await screen.findByRole('region', { name: 'Backtests' });
    expect(new URLSearchParams(app.router.state.location.search).has('tipo')).toBe(false);
  });
});
