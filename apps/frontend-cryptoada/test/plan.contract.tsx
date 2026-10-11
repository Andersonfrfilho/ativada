// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@cryptoada/environment';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { mapPlanChart } from '../src/goals/plan-chart.js';
import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import {
  buildDailyCandles,
  buildPlanLevel,
  buildPlanView,
  PLAN_NOW,
} from './support/plan-fixtures.js';
import { renderApp } from './support/render-app.js';

const PATH = '/metas/goal-1/plano?strategyId=strategy-1';

function planRoutes(
  view: Record<string, unknown>,
  extra: readonly FakeRoute[] = [],
): readonly FakeRoute[] {
  return [
    ...extra,
    { method: 'GET', path: '/v1/goals/goal-1/plan', respond: (): Response => dataResponse(view) },
    {
      method: 'GET',
      path: '/v1/markets/candles',
      respond: (): Response => dataResponse(buildDailyCandles()),
    },
    { method: 'GET', path: '/v1/price-alerts', respond: (): Response => pageResponse([]) },
  ];
}

function tick(price: string): {
  symbol: string;
  price: string;
  change24h: string | null;
  at: number;
  isStale: boolean;
} {
  return { symbol: 'BTCUSDT', price, change24h: null, at: PLAN_NOW, isStale: false };
}

describe('plan chart mapping', () => {
  test('higher prices get smaller y, later times get larger x, and it stays inside the box', () => {
    const mapped = mapPlanChart({
      width: 600,
      height: 300,
      prices: [100, 200],
      times: [1_000, 3_000],
    });
    expect(mapped.y(200)).toBeLessThan(mapped.y(100));
    expect(mapped.x(3_000)).toBeGreaterThan(mapped.x(1_000));
    for (const value of [100, 200]) {
      expect(mapped.y(value)).toBeGreaterThanOrEqual(0);
      expect(mapped.y(value)).toBeLessThanOrEqual(300);
    }
    expect(mapped.x(1_000)).toBeGreaterThanOrEqual(0);
    expect(mapped.x(3_000)).toBeLessThanOrEqual(600);
  });

  test('a flat price range does not divide by zero', () => {
    const mapped = mapPlanChart({ width: 600, height: 300, prices: [100, 100], times: [1, 1] });
    expect(Number.isFinite(mapped.y(100))).toBe(true);
    expect(Number.isFinite(mapped.x(1))).toBe(true);
  });
});

describe('operation plan', () => {
  test('shows buy price, target, stop, deadline and that the basis is exact', async () => {
    renderApp({ path: PATH, isAuthenticated: true, routes: planRoutes(buildPlanView()) });
    const card = await screen.findByRole('region', { name: 'Plano de operação' });
    expect(card.textContent).toContain('Placar clássico');
    expect(card.textContent).toContain('58.800,00');
    expect(card.textContent).toContain('fechar nesse preço ou abaixo');
    expect(card.textContent).toContain('60.564,00');
    expect(card.textContent).toContain('55.860,00');
    expect(card.textContent).toContain('10/11/2026');
    expect(card.textContent).toContain('Exato');
  });

  test('an indicative plan says it depends on the next candle', async () => {
    renderApp({
      path: PATH,
      isAuthenticated: true,
      routes: planRoutes(buildPlanView({ basis: 'indicative' })),
    });
    const card = await screen.findByRole('region', { name: 'Plano de operação' });
    expect(card.textContent).toContain('Indicativo');
    expect(card.textContent).toContain('volume');
  });

  test('when the signal is already active it says so and uses the last close as reference', async () => {
    const view = buildPlanView({
      buy: buildPlanLevel({
        status: 'already_active',
        price: null,
        trigger: null,
        direction: null,
        distance: null,
        distanceRate: null,
      }),
      entryReference: '60000',
    });
    renderApp({ path: PATH, isAuthenticated: true, routes: planRoutes(view) });
    const card = await screen.findByRole('region', { name: 'Plano de operação' });
    expect(card.textContent).toContain('sinal de compra já ativo');
    expect(card.textContent).toContain('60.000,00');
  });

  test('draws the price and the three levels in order, hand-made in SVG', async () => {
    renderApp({ path: PATH, isAuthenticated: true, routes: planRoutes(buildPlanView()) });
    const chart = await screen.findByRole('img', { name: 'Gráfico do plano: preço e níveis' });
    const yOf = (level: string): number =>
      Number(chart.querySelector(`[data-level="${level}"]`)?.getAttribute('y1'));
    expect(yOf('target')).toBeLessThan(yOf('buy'));
    expect(yOf('buy')).toBeLessThan(yOf('stop'));
    expect(chart.querySelector('polyline[data-series="price"]')).not.toBeNull();
  });

  test('"Avisar no plano" creates the alert with origin plan and the side that fires', async () => {
    const { fake } = renderApp({
      path: PATH,
      isAuthenticated: true,
      routes: planRoutes(buildPlanView(), [
        {
          method: 'POST',
          path: '/v1/price-alerts',
          respond: (): Response => dataResponse({ id: 'pa-9' }, HTTP_STATUS.CREATED),
        },
      ]),
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Avisar no plano: compra em 58.800,00' }),
    );
    await waitFor(() => expect(fake.callsTo('POST', '/v1/price-alerts')).toHaveLength(1));
    expect(fake.callsTo('POST', '/v1/price-alerts')[0]?.body).toEqual({
      symbol: 'BTCUSDT',
      direction: 'below',
      value: '58800',
      origin: 'plan',
    });
    expect(
      await screen.findByText('Alerta criado: avisamos quando o preço chegar lá.'),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Avisar no plano: alvo em 60.564,00' }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/price-alerts')).toHaveLength(2));
    expect(fake.callsTo('POST', '/v1/price-alerts')[1]?.body).toEqual({
      symbol: 'BTCUSDT',
      direction: 'above',
      value: '60564',
      origin: 'plan',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Avisar no plano: stop em 55.860,00' }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/price-alerts')).toHaveLength(3));
    expect(fake.callsTo('POST', '/v1/price-alerts')[2]?.body).toMatchObject({
      direction: 'below',
      value: '55860',
    });
  });

  test('the alert limit comes back in words', async () => {
    renderApp({
      path: PATH,
      isAuthenticated: true,
      routes: planRoutes(buildPlanView(), [
        {
          method: 'POST',
          path: '/v1/price-alerts',
          respond: (): Response => errorResponse(HTTP_STATUS.CONFLICT, 'PRICE_ALERT_LIMIT_REACHED'),
        },
      ]),
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Avisar no plano: alvo em 60.564,00' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('limite de alertas');
  });

  test('the live price moves the distances to each level by itself, with no reload', async () => {
    const { stream, fake } = renderApp({
      path: PATH,
      isAuthenticated: true,
      routes: planRoutes(buildPlanView()),
    });
    const card = await screen.findByRole('region', { name: 'Plano de operação' });
    await waitFor(() => expect(card.textContent).toContain('Preço agora 59.950,00'));
    const calls = fake.calls.length;
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('59000')));
    await waitFor(() => expect(card.textContent).toContain('Preço agora 59.000,00'));
    expect(card.textContent).toContain('+2,65%');
    act(() => stream.tick(tick('60000')));
    await waitFor(() => expect(card.textContent).toContain('Preço agora 60.000,00'));
    expect(card.textContent).toContain('+0,94%');
    expect(fake.calls.length).toBe(calls);
  });

  test('without a strategy it points back to the ranking', async () => {
    renderApp({
      path: '/metas/goal-1/plano',
      isAuthenticated: true,
      routes: planRoutes(buildPlanView()),
    });
    const message = await screen.findByText(/Escolha uma estratégia no ranking/);
    expect(message).toBeDefined();
    expect(screen.getByRole('link', { name: 'Voltar à meta' }).getAttribute('href')).toBe(
      '/metas/goal-1',
    );
  });

  test('a plan the engine cannot build says why', async () => {
    renderApp({
      path: PATH,
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/goals/goal-1/plan',
          respond: (): Response => errorResponse(HTTP_STATUS.CONFLICT, 'GOAL_PLAN_UNAVAILABLE'),
        },
        { method: 'GET', path: '/v1/markets/candles', respond: (): Response => dataResponse([]) },
      ],
    });
    expect((await screen.findByRole('alert')).textContent).toContain('candles suficientes');
  });

  test('the chart keeps working with the plan levels only when there is no candle history', async () => {
    renderApp({
      path: PATH,
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/goals/goal-1/plan',
          respond: (): Response => dataResponse(buildPlanView()),
        },
        { method: 'GET', path: '/v1/markets/candles', respond: (): Response => dataResponse([]) },
      ],
    });
    const chart = await screen.findByRole('img', { name: 'Gráfico do plano: preço e níveis' });
    expect(chart.querySelector('[data-level="target"]')).not.toBeNull();
  });
});
