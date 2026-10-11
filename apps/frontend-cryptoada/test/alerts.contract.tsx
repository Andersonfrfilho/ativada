// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@cryptoada/environment';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const HOUR = 3_600_000;

const RUN = {
  id: 'run-1',
  strategyVersionId: 'version-1',
  kind: 'live_paper',
  status: 'running',
  symbol: 'BTCUSDT',
  timeframe: '1h',
  runParameters: {},
  periodStart: NOW - 48 * HOUR,
  periodEnd: null,
  progress: 0,
  metrics: null,
  overfitting: null,
  errorCode: null,
  createdAt: '2026-10-09T12:00:00.000Z',
};

function signal(action: string, reason: string, hoursAgo: number): Record<string, unknown> {
  return {
    candleTime: NOW - hoursAgo * HOUR,
    action,
    score: action === 'SELL' ? '-3' : '3',
    regime: 'trending',
    votes: {},
    indicators: {},
    reason,
  };
}

function priceAlert(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'pa-1',
    symbol: 'BTCUSDT',
    direction: 'above',
    value: '70000',
    origin: 'manual',
    isEnabled: false,
    triggeredAt: '2026-10-11T09:30:00.000Z',
    createdAt: '2026-10-10T09:30:00.000Z',
    ...overrides,
  };
}

const PROFILE = {
  id: 'u1',
  displayName: null,
  displayCurrency: 'BRL',
  timezone: 'America/Sao_Paulo',
  alertTelegramEnabled: true,
  telegramLinked: false,
  createdAt: '2026-10-01T10:00:00.000Z',
};

type World = { signals: Record<string, unknown>[]; priceAlerts: Record<string, unknown>[] };

function routes(world: World): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: '/v1/runs',
      respond: (call): Response =>
        pageResponse(call.query.get('kind') === 'live_paper' ? [RUN] : []),
    },
    {
      method: 'GET',
      path: '/v1/runs/run-1/signals',
      respond: (call): Response =>
        pageResponse(call.query.get('order') === 'desc' ? [...world.signals].reverse() : []),
    },
    {
      method: 'GET',
      path: '/v1/price-alerts',
      respond: (): Response => pageResponse(world.priceAlerts),
    },
    {
      method: 'DELETE',
      path: '/v1/price-alerts/fired',
      respond: (): Response => {
        const deleted = world.priceAlerts.filter((alert) => alert['triggeredAt'] !== null).length;
        world.priceAlerts = world.priceAlerts.filter((alert) => alert['triggeredAt'] === null);
        return dataResponse({ deleted });
      },
    },
    { method: 'GET', path: '/v1/me', respond: (): Response => dataResponse(PROFILE) },
    {
      method: 'PATCH',
      path: '/v1/me',
      respond: (call): Response => dataResponse({ ...PROFILE, ...(call.body as object) }),
    },
  ];
}

function newWorld(): World {
  return {
    signals: [
      signal('BUY', 'Compra 3/4: tendência, MACD e volume confirmam', 30),
      signal('HOLD', 'Neutro: placar entre os limiares', 20),
      signal('SELL', 'Venda 3/4: reversão e RSI esticado', 10),
    ],
    priceAlerts: [
      priceAlert({ id: 'pa-1' }),
      priceAlert({
        id: 'pa-2',
        direction: 'below',
        value: '60000',
        triggeredAt: '2026-10-11T08:00:00.000Z',
      }),
      priceAlert({ id: 'pa-3', isEnabled: true, triggeredAt: null, value: '80000' }),
    ],
  };
}

describe('signal history', () => {
  test('lists the buy and sell signals of the live simulation, newest first, without the neutral ones', async () => {
    renderApp({ path: '/alertas', isAuthenticated: true, routes: routes(newWorld()) });
    const list = await screen.findByRole('list', { name: 'Histórico de sinais' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Venda');
    expect(items[0]?.textContent).toContain('reversão e RSI esticado');
    expect(items[1]?.textContent).toContain('Compra');
    expect(list.textContent).not.toContain('Neutro');
  });

  test('without a live simulation it says so', async () => {
    renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: [
        { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
        { method: 'GET', path: '/v1/price-alerts', respond: (): Response => pageResponse([]) },
        { method: 'GET', path: '/v1/me', respond: (): Response => dataResponse(PROFILE) },
      ],
    });
    expect(await screen.findByText('Nenhuma simulação ao vivo ativa')).toBeDefined();
  });

  test('a new signal pushed by the server shows up without reloading the page', async () => {
    const world = newWorld();
    const { fake, stream, router } = renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: routes(world),
    });
    await screen.findByRole('list', { name: 'Histórico de sinais' });
    world.signals.push(signal('BUY', 'Compra 4/4: todos os votos a favor', 0));
    const before = fake.callsTo('GET', '/v1/runs/run-1/signals').length;
    act(() =>
      stream.emit({ type: 'event', runId: 'run-1', kind: 'signal', eventId: 'e1', at: NOW }),
    );
    expect(await screen.findByText(/Compra 4\/4/)).toBeDefined();
    expect(fake.callsTo('GET', '/v1/runs/run-1/signals').length).toBeGreaterThan(before);
    expect(router.state.location.pathname).toBe('/alertas');
    expect(stream.connections()).toBe(1);
  });

  test('a resync refetches over REST, so nothing lost while disconnected stays wrong', async () => {
    const world = newWorld();
    const { fake, stream } = renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: routes(world),
    });
    await screen.findByRole('list', { name: 'Histórico de sinais' });
    world.signals.push(signal('SELL', 'Venda 2/4: perdido durante a queda', 0));
    const before = fake.callsTo('GET', '/v1/runs/run-1/signals').length;
    act(() => stream.resync('reconnected'));
    expect(await screen.findByText(/perdido durante a queda/)).toBeDefined();
    expect(fake.callsTo('GET', '/v1/runs/run-1/signals').length).toBeGreaterThan(before);
  });
});

describe('signal history with pages full of neutral decisions', () => {
  function holdPage(): Record<string, unknown>[] {
    return Array.from({ length: 100 }, (_unused, index) =>
      signal('HOLD', 'Neutro: placar entre os limiares', index + 1),
    );
  }

  function routesWithPages(pageFor: (cursor: string | null) => Response): readonly FakeRoute[] {
    return [
      ...routes(newWorld()).filter((route) => !route.path.endsWith('/signals')),
      {
        method: 'GET',
        path: '/v1/runs/run-1/signals',
        respond: (call): Response => pageFor(call.query.get('cursor')),
      },
    ];
  }

  test('keeps fetching older pages on its own until a buy or sell shows up', async () => {
    renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: routesWithPages((cursor) =>
        cursor === null
          ? pageResponse(holdPage(), 'p2')
          : pageResponse([signal('BUY', 'Compra 3/4: achada na segunda página', 150)]),
      ),
    });
    const list = await screen.findByRole('list', { name: 'Histórico de sinais' });
    expect(list.textContent).toContain('achada na segunda página');
  });

  test('after 5 neutral pages it says so honestly and offers to keep looking', async () => {
    renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: routesWithPages((cursor) =>
        pageResponse(holdPage(), `p${Number(cursor?.slice(1) ?? '0') + 1}`),
      ),
    });
    expect(
      await screen.findByText(/Nenhuma compra nem venda nas últimas 500 decisões/),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Carregar sinais mais antigos' })).toBeDefined();
  });
});

describe('fired price alerts', () => {
  test('lists the fired ones with their trigger and keeps the armed ones apart', async () => {
    renderApp({ path: '/alertas', isAuthenticated: true, routes: routes(newWorld()) });
    const fired = await screen.findByRole('list', { name: 'Alertas de preço disparados' });
    const items = within(fired).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('BTC/USDT');
    expect(items[0]?.textContent).toContain('acima de 70.000,00');
    expect(items[1]?.textContent).toContain('abaixo de 60.000,00');
    expect(screen.getByText(/1 alerta armado/)).toBeDefined();
  });

  test('clearing the fired ones asks the API, says how many went away and keeps the armed one', async () => {
    const world = newWorld();
    const { fake } = renderApp({ path: '/alertas', isAuthenticated: true, routes: routes(world) });
    fireEvent.click(await screen.findByRole('button', { name: 'Limpar disparados' }));
    await waitFor(() => expect(fake.callsTo('DELETE', '/v1/price-alerts/fired')).toHaveLength(1));
    expect(await screen.findByText('2 alertas apagados.')).toBeDefined();
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Alertas de preço disparados' })).toBeNull(),
    );
    expect(screen.getByText(/1 alerta armado/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Limpar disparados' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  test('a price alert fired on the server appears on its own', async () => {
    const world = newWorld();
    world.priceAlerts = [
      priceAlert({ id: 'pa-3', isEnabled: true, triggeredAt: null, value: '80000' }),
    ];
    const { stream } = renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: routes(world),
    });
    expect(await screen.findByText(/1 alerta armado/)).toBeDefined();
    expect(screen.queryByRole('list', { name: 'Alertas de preço disparados' })).toBeNull();
    world.priceAlerts = [
      priceAlert({ id: 'pa-3', value: '80000', triggeredAt: '2026-10-11T11:00:00.000Z' }),
    ];
    act(() => stream.emit({ type: 'price_alert', alertId: 'pa-3', at: NOW }));
    const fired = await screen.findByRole('list', { name: 'Alertas de preço disparados' });
    expect(fired.textContent).toContain('acima de 80.000,00');
  });
});

describe('alert preferences', () => {
  test('toggles the Telegram alerts and points to the account to link the chat', async () => {
    const { fake } = renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: routes(newWorld()),
    });
    const box = await screen.findByRole('checkbox', { name: 'Receber alertas no Telegram' });
    expect(box).toHaveProperty('checked', true);
    fireEvent.click(box);
    await waitFor(() =>
      expect(fake.callsTo('PATCH', '/v1/me')[0]?.body).toEqual({ alertTelegramEnabled: false }),
    );
    expect(screen.getByText('Telegram não vinculado')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Vincular na conta' }).getAttribute('href')).toBe(
      '/conta',
    );
  });
});

describe('live connection', () => {
  test('opens one socket for the signed-in panel and shows its state', async () => {
    const { stream } = renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: routes(newWorld()),
    });
    await screen.findByRole('list', { name: 'Histórico de sinais' });
    expect(stream.connections()).toBe(1);
    act(() => stream.setStatus('live'));
    expect(screen.getByText('Ao vivo')).toBeDefined();
    act(() => stream.setStatus('reconnecting'));
    expect(screen.getByText('Reconectando…')).toBeDefined();
    act(() => stream.setStatus('blocked'));
    expect(screen.getByText('Conta inativa')).toBeDefined();
  });

  test('closes the socket when the user signs out', async () => {
    const { stream } = renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: [
        ...routes(newWorld()),
        {
          method: 'DELETE',
          path: '/v1/session',
          respond: (): Response => new Response(null, { status: HTTP_STATUS.NO_CONTENT }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(stream.stops()).toBeGreaterThan(0));
  });

  test('when the server cannot confirm the sign-out, the login page says so', async () => {
    renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: [
        ...routes(newWorld()),
        {
          method: 'DELETE',
          path: '/v1/session',
          respond: (): Response => new Response(null, { status: HTTP_STATUS.SERVICE_UNAVAILABLE }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    const notice = await screen.findByRole('alert');
    expect(notice.textContent).toContain('não conseguimos confirmar');
  });

  test('a confirmed sign-out shows no warning on the login page', async () => {
    renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: [
        ...routes(newWorld()),
        {
          method: 'DELETE',
          path: '/v1/session',
          respond: (): Response => new Response(null, { status: HTTP_STATUS.NO_CONTENT }),
        },
      ],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await screen.findByRole('button', { name: 'Entrar com Keycloak' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
