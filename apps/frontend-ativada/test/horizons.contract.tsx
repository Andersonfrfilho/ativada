// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor } from '@testing-library/react';

import { horizonsSchema } from '../src/horizons/horizon.validation.js';
import { buildStrategy } from './support/run-fixtures.js';
import { dataResponse, jsonResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import {
  buildDailyRow,
  buildNoneRecommendedHorizons,
  buildRecommendedHorizons,
} from './support/horizon-fixtures.js';
import { renderApp } from './support/render-app.js';

function horizonRoutes(body: unknown = buildRecommendedHorizons()): readonly FakeRoute[] {
  return [
    { method: 'GET', path: '/v1/horizons', respond: (): Response => dataResponse(body) },
    {
      method: 'GET',
      path: '/v1/strategies',
      respond: (): Response =>
        pageResponse([buildStrategy({ id: 'strategy-1', name: 'Momentum rápido' })]),
    },
  ];
}

describe('horizons route and menu', () => {
  test('the menu offers "Prazos" and it opens /prazos', async () => {
    const { router } = renderApp({ path: '/', isAuthenticated: true, routes: horizonRoutes() });
    const link = await screen.findByRole('link', { name: 'Prazos' });
    expect(link.getAttribute('href')).toBe('/prazos');
    fireEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe('/prazos'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Prazos' })).toBeDefined();
  });

  test('asks for the first enabled coin and the best strategy per horizon by default', async () => {
    const { fake } = renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes() });
    expect(await screen.findByLabelText('Moeda')).toHaveProperty('value', 'BTCUSDT');
    expect(screen.getByLabelText('Estratégia')).toHaveProperty('value', '');
    await waitFor(() => expect(fake.callsTo('GET', '/v1/horizons')).toHaveLength(1));
    const query = fake.callsTo('GET', '/v1/horizons')[0]?.query;
    expect(query?.get('symbol')).toBe('BTCUSDT');
    expect(query?.has('strategyId')).toBe(false);
  });

  test('reads the coin and the strategy from the URL', async () => {
    const { fake } = renderApp({
      path: '/prazos?symbol=ETHUSDT&strategyId=strategy-1',
      isAuthenticated: true,
      routes: horizonRoutes(),
    });
    await waitFor(() => expect(fake.callsTo('GET', '/v1/horizons')).toHaveLength(1));
    const query = fake.callsTo('GET', '/v1/horizons')[0]?.query;
    expect(query?.get('symbol')).toBe('ETHUSDT');
    expect(query?.get('strategyId')).toBe('strategy-1');
    expect(screen.getByLabelText('Moeda')).toHaveProperty('value', 'ETHUSDT');
    await waitFor(() =>
      expect(screen.getByLabelText('Estratégia')).toHaveProperty('value', 'strategy-1'),
    );
  });

  test('a coin that is not enabled falls back to the first one', async () => {
    const { fake } = renderApp({
      path: '/prazos?symbol=DOGEUSDT',
      isAuthenticated: true,
      routes: horizonRoutes(),
    });
    await waitFor(() => expect(fake.callsTo('GET', '/v1/horizons')).toHaveLength(1));
    expect(fake.callsTo('GET', '/v1/horizons')[0]?.query.get('symbol')).toBe('BTCUSDT');
  });

  test('changing the selectors writes the URL and asks again', async () => {
    const { fake, router } = renderApp({
      path: '/prazos',
      isAuthenticated: true,
      routes: horizonRoutes(),
    });
    fireEvent.change(await screen.findByLabelText('Moeda'), { target: { value: 'ETHUSDT' } });
    await waitFor(() => expect(router.state.location.search).toBe('?symbol=ETHUSDT'));
    await waitFor(() =>
      expect(screen.getByLabelText('Estratégia').querySelectorAll('option')).toHaveLength(2),
    );
    fireEvent.change(screen.getByLabelText('Estratégia'), { target: { value: 'strategy-1' } });
    await waitFor(() =>
      expect(router.state.location.search).toBe('?symbol=ETHUSDT&strategyId=strategy-1'),
    );
    await waitFor(() => expect(fake.callsTo('GET', '/v1/horizons')).toHaveLength(3));
    fireEvent.change(screen.getByLabelText('Estratégia'), { target: { value: '' } });
    await waitFor(() => expect(router.state.location.search).toBe('?symbol=ETHUSDT'));
  });

  test('the strategy list offers "Melhor por prazo" first, then the user strategies', async () => {
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes() });
    await waitFor(() =>
      expect(
        [...screen.getByLabelText('Estratégia').querySelectorAll('option')].map(
          (option) => option.textContent,
        ),
      ).toEqual(['Melhor por prazo', 'Momentum rápido']),
    );
  });
});

describe('horizons response validation', () => {
  test('accepts both spec cases', () => {
    expect(horizonsSchema.safeParse(buildRecommendedHorizons()).success).toBe(true);
    expect(horizonsSchema.safeParse(buildNoneRecommendedHorizons()).success).toBe(true);
  });

  test('refuses what does not fit the contract', () => {
    const valid = buildRecommendedHorizons();
    const bad: unknown[] = [
      { ...valid, rows: 'x' },
      { ...valid, recommendationMessage: undefined },
      { ...valid, rows: [{ kind: 'weekly' }] },
      { ...valid, recommendedHorizonDays: 'trinta' },
    ];
    for (const body of bad) expect(horizonsSchema.safeParse(body).success).toBe(false);
  });

  test('refuses a rate that is not plain decimal text', () => {
    const body = { ...buildRecommendedHorizons(), rows: [buildDailyRow(7, { median: 'NaN' })] };
    expect(horizonsSchema.safeParse(body).success).toBe(false);
  });

  test('an invalid response does not render: it shows the standard error state', async () => {
    renderApp({
      path: '/prazos',
      isAuthenticated: true,
      routes: horizonRoutes({ symbol: 'BTCUSDT', rows: 'lixo' }),
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não foi possível carregar os prazos');
    expect(screen.queryByText(/mais recomendável/)).toBeNull();
  });

  test('a failed request shows the same error state', async () => {
    renderApp({
      path: '/prazos',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/horizons',
          respond: (): Response => jsonResponse({ error: { code: 'X', message: 'x' } }, 500),
        },
        ...horizonRoutes().slice(1),
      ],
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível carregar os prazos',
    );
  });
});
