// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../src/account/useUserTimeZone.hook.js';
import { dataResponse, errorResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

function Probe(): ReactElement {
  return <p>zona:{useUserTimeZone()}</p>;
}

function profileRoute(timezone: string): FakeRoute {
  return {
    method: 'GET',
    path: '/v1/me',
    respond: (): Response =>
      dataResponse({
        id: 'user-1',
        displayName: null,
        displayCurrency: 'BRL',
        timezone,
        alertTelegramEnabled: false,
        telegramLinked: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
  };
}

function show(routes: readonly FakeRoute[]): void {
  renderApp({ path: '/', isAuthenticated: true, routes, probe: <Probe /> });
}

describe('useUserTimeZone', () => {
  test('shows UTC while the profile loads, then the zone of the user', async () => {
    show([profileRoute('America/New_York')]);
    expect(screen.getByText('zona:UTC')).toBeDefined();
    expect(await screen.findByText('zona:America/New_York')).toBeDefined();
  });

  test('an invalid zone in the profile falls back to America/Sao_Paulo', async () => {
    show([profileRoute('Marte/Olympus')]);
    expect(await screen.findByText('zona:America/Sao_Paulo')).toBeDefined();
  });

  test('a failed profile falls back to America/Sao_Paulo', async () => {
    show([
      { method: 'GET', path: '/v1/me', respond: (): Response => errorResponse(500, 'INTERNAL') },
    ]);
    expect(await screen.findByText('zona:America/Sao_Paulo')).toBeDefined();
  });
});
