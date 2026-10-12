// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@ativada/environment';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');

function alert(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'pa-1',
    symbol: 'BTCUSDT',
    direction: 'above',
    value: '70000',
    origin: 'manual',
    isEnabled: true,
    triggeredAt: null,
    createdAt: '2026-10-10T09:30:00.000Z',
    ...overrides,
  };
}

type World = { alerts: Record<string, unknown>[] };

function routes(world: World, extra: readonly FakeRoute[] = []): readonly FakeRoute[] {
  return [
    ...extra,
    { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
    {
      method: 'GET',
      path: '/v1/price-alerts',
      respond: (): Response => pageResponse(world.alerts),
    },
  ];
}

async function openBoard(
  world: World,
  extra: readonly FakeRoute[] = [],
): Promise<ReturnType<typeof renderApp>> {
  const rendered = renderApp({
    path: '/alertas',
    isAuthenticated: true,
    routes: routes(world, extra),
  });
  await screen.findByRole('button', { name: 'Criar alerta' });
  if (world.alerts.length > 0) {
    await screen.findByRole('list', { name: 'Gerenciar alertas de preço' });
  }
  return rendered;
}

describe('price alert board', () => {
  test('lists every alert with its state: armed, off and fired', async () => {
    const world: World = {
      alerts: [
        alert({ id: 'a' }),
        alert({ id: 'b', isEnabled: false, direction: 'below', value: '50000' }),
        alert({
          id: 'c',
          isEnabled: false,
          triggeredAt: '2026-10-11T09:30:00.000Z',
          value: '65000',
        }),
      ],
    };
    await openBoard(world);
    const items = within(
      screen.getByRole('list', { name: 'Gerenciar alertas de preço' }),
    ).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain('acima de 70.000,00');
    expect(items[0]?.textContent).toContain('Armado');
    expect(items[1]?.textContent).toContain('abaixo de 50.000,00');
    expect(items[1]?.textContent).toContain('Desligado');
    expect(items[2]?.textContent).toContain('Disparado');
  });

  test('creates an alert from the form, sending the text value as typed and origin manual', async () => {
    const world: World = { alerts: [] };
    const { fake } = await openBoard(world, [
      {
        method: 'POST',
        path: '/v1/price-alerts',
        respond: (): Response => {
          world.alerts = [
            alert({ id: 'new', symbol: 'ETHUSDT', direction: 'below', value: '3000.5' }),
          ];
          return dataResponse(world.alerts[0], HTTP_STATUS.CREATED);
        },
      },
    ]);
    fireEvent.change(screen.getByLabelText('Par do alerta'), { target: { value: 'ETHUSDT' } });
    fireEvent.change(screen.getByLabelText('Quando o preço'), { target: { value: 'below' } });
    fireEvent.change(screen.getByLabelText('Valor do alerta'), { target: { value: '3000.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar alerta' }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/price-alerts')).toHaveLength(1));
    expect(fake.callsTo('POST', '/v1/price-alerts')[0]?.body).toEqual({
      symbol: 'ETHUSDT',
      direction: 'below',
      value: '3000.5',
      origin: 'manual',
    });
    const list = await screen.findByRole('list', { name: 'Gerenciar alertas de preço' });
    await waitFor(() => expect(list.textContent).toContain('ETH/USDT caiu abaixo de 3.000,50'));
  });

  test('accepts the Brazilian comma and sends the value with a dot', async () => {
    const { fake } = await openBoard({ alerts: [] }, [
      {
        method: 'POST',
        path: '/v1/price-alerts',
        respond: (): Response => dataResponse({ id: 'x' }, HTTP_STATUS.CREATED),
      },
    ]);
    fireEvent.change(screen.getByLabelText('Valor do alerta'), { target: { value: '3000,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar alerta' }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/price-alerts')).toHaveLength(1));
    expect(fake.callsTo('POST', '/v1/price-alerts')[0]?.body).toMatchObject({ value: '3000.5' });
  });

  test('a bad value is stopped before the API', async () => {
    const { fake } = await openBoard({ alerts: [] });
    fireEvent.change(screen.getByLabelText('Valor do alerta'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar alerta' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Valor do alerta');
    expect(fake.callsTo('POST', '/v1/price-alerts')).toHaveLength(0);
  });

  test('turns an armed alert off and an off one back on', async () => {
    const world: World = {
      alerts: [
        alert({ id: 'a' }),
        alert({ id: 'b', isEnabled: false, value: '50000', direction: 'below' }),
      ],
    };
    const { fake } = await openBoard(world, [
      {
        method: 'PATCH',
        path: '/v1/price-alerts/a',
        respond: (): Response => dataResponse(alert({ id: 'a', isEnabled: false })),
      },
      {
        method: 'PATCH',
        path: '/v1/price-alerts/b',
        respond: (): Response => dataResponse(alert({ id: 'b' })),
      },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Desligar alerta BTC/USDT acima de 70.000,00' }),
    );
    await waitFor(() =>
      expect(fake.callsTo('PATCH', '/v1/price-alerts/a')[0]?.body).toEqual({ isEnabled: false }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Ligar alerta BTC/USDT abaixo de 50.000,00' }),
    );
    await waitFor(() =>
      expect(fake.callsTo('PATCH', '/v1/price-alerts/b')[0]?.body).toEqual({ isEnabled: true }),
    );
  });

  test('re-arms a fired alert', async () => {
    const world: World = {
      alerts: [alert({ id: 'c', isEnabled: false, triggeredAt: '2026-10-11T09:30:00.000Z' })],
    };
    const { fake } = await openBoard(world, [
      {
        method: 'PATCH',
        path: '/v1/price-alerts/c',
        respond: (): Response => dataResponse(alert({ id: 'c' })),
      },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Religar alerta BTC/USDT acima de 70.000,00' }),
    );
    await waitFor(() =>
      expect(fake.callsTo('PATCH', '/v1/price-alerts/c')[0]?.body).toEqual({ isEnabled: true }),
    );
  });

  test('deleting an alert asks first, then calls the API', async () => {
    const world: World = { alerts: [alert({ id: 'a' })] };
    const { fake } = await openBoard(world, [
      {
        method: 'DELETE',
        path: '/v1/price-alerts/a',
        respond: (): Response => {
          world.alerts = [];
          return new Response(null, { status: HTTP_STATUS.NO_CONTENT });
        },
      },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Apagar alerta BTC/USDT acima de 70.000,00' }),
    );
    expect(fake.callsTo('DELETE', '/v1/price-alerts/a')).toHaveLength(0);
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar: apagar alerta BTC/USDT acima de 70.000,00' }),
    );
    await waitFor(() => expect(fake.callsTo('DELETE', '/v1/price-alerts/a')).toHaveLength(1));
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Gerenciar alertas de preço' })).toBeNull(),
    );
  });

  test('the armed-alert limit is explained in words', async () => {
    const world: World = { alerts: [alert({ id: 'b', isEnabled: false })] };
    await openBoard(world, [
      {
        method: 'PATCH',
        path: '/v1/price-alerts/b',
        respond: (): Response => errorResponse(HTTP_STATUS.CONFLICT, 'PRICE_ALERT_LIMIT_REACHED'),
      },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Ligar alerta BTC/USDT acima de 70.000,00' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('limite de alertas');
  });

  test('an alert fired by the server turns "Disparado" on its own through the socket', async () => {
    const world: World = { alerts: [alert({ id: 'a' })] };
    const { stream } = await openBoard(world);
    world.alerts = [alert({ id: 'a', isEnabled: false, triggeredAt: '2026-10-11T11:00:00.000Z' })];
    act(() => stream.emit({ type: 'price_alert', alertId: 'a', at: NOW }));
    const list = screen.getByRole('list', { name: 'Gerenciar alertas de preço' });
    await waitFor(() => expect(list.textContent).toContain('Disparado'));
  });
});

describe('decimals from the API', () => {
  test('a value that is not a decimal fails the schema instead of showing NaN', async () => {
    renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: [
        { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
        {
          method: 'GET',
          path: '/v1/price-alerts',
          respond: (): Response => pageResponse([alert({ id: 'a', value: 'abc' })]),
        },
      ],
    });
    await screen.findByRole('button', { name: 'Criar alerta' });
    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').some((item) => item.textContent?.includes('Não foi possível')),
      ).toBe(true),
    );
    expect(document.body.textContent).not.toContain('NaN');
  });

  test('keeps up to 8 places where the API accepts 8 (a cheap coin is not cut to cents)', async () => {
    renderApp({
      path: '/alertas',
      isAuthenticated: true,
      routes: [
        { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
        {
          method: 'GET',
          path: '/v1/price-alerts',
          respond: (): Response =>
            pageResponse([alert({ id: 'a', value: '0.00001234', symbol: 'ETHUSDT' })]),
        },
      ],
    });
    const list = await screen.findByRole('list', { name: 'Gerenciar alertas de preço' });
    expect(list.textContent).toContain('0,00001234');
  });
});
