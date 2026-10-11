// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { SIMULATION_NOTICE } from '../src/app/app.constant.js';
import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

const QUIET_ROUTES: readonly FakeRoute[] = [
  { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
  {
    method: 'GET',
    path: '/v1/me',
    respond: (): Response =>
      dataResponse({
        id: 'u1',
        displayName: null,
        displayCurrency: 'BRL',
        timezone: 'America/Sao_Paulo',
        alertTelegramEnabled: true,
        telegramLinked: false,
        createdAt: '2026-10-01T10:00:00.000Z',
      }),
  },
  { method: 'GET', path: '/v1/markets/candles', respond: (): Response => dataResponse([]) },
];
const ALL_PATHS = [
  '/login',
  '/auth/callback',
  '/',
  '/conta',
  '/backtests',
  '/backtests/run-1',
  '/backtests/comparar',
  '/estrategias',
  '/estrategias/strategy-1',
  '/alertas',
  '/rota-que-nao-existe',
] as const;

describe('permanent simulation notice', () => {
  for (const isAuthenticated of [false, true]) {
    for (const path of ALL_PATHS) {
      test(`is visible on ${path} (${isAuthenticated ? 'with' : 'without'} session)`, async () => {
        renderApp({ path, isAuthenticated, routes: QUIET_ROUTES });
        const notice = await screen.findByRole('note', { name: 'Aviso de simulação' });
        expect(notice.textContent).toContain(SIMULATION_NOTICE);
        await waitFor(() => expect(screen.queryByText('Carregando…')).toBeNull());
        expect(screen.getByRole('note', { name: 'Aviso de simulação' })).toBe(notice);
      });
    }
  }

  test('cannot be dismissed: the notice has no controls', async () => {
    renderApp({ path: '/login', isAuthenticated: false });
    const notice = await screen.findByRole('note', { name: 'Aviso de simulação' });
    expect(within(notice).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('protected routes', () => {
  for (const path of ['/', '/conta']) {
    test(`${path} without a session leads to the login screen`, async () => {
      const { router } = renderApp({ path, isAuthenticated: false });
      await screen.findByRole('button', { name: 'Entrar com Keycloak' });
      expect(router.state.location.pathname).toBe('/login');
    });
  }

  test('the login screen sends a signed-in user to the overview', async () => {
    const { router } = renderApp({ path: '/login', isAuthenticated: true, routes: QUIET_ROUTES });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  test('an unknown route says so and offers the way back', async () => {
    renderApp({ path: '/nada-aqui', isAuthenticated: true, routes: QUIET_ROUTES });
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Voltar à visão geral' })).toBeDefined();
  });
});

describe('session check failures', () => {
  test('a rate-limited refresh is not a logout: it offers to try again and recovers', async () => {
    let attempts = 0;
    const routes: readonly FakeRoute[] = [
      ...QUIET_ROUTES,
      {
        method: 'POST',
        path: '/v1/session/refresh',
        respond: (): Response =>
          (attempts += 1) === 1
            ? errorResponse(429, 'RATE_LIMITED')
            : dataResponse({ accessToken: 'a.e30.s', expiresIn: 300 }),
      },
    ];
    const { router } = renderApp({
      path: '/',
      isAuthenticated: false,
      routes,
      ownsSessionRoute: true,
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível verificar');
    expect(router.state.location.pathname).toBe('/');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeDefined();
  });
});

describe('login callback', () => {
  test('exchanges the code with the stored verifier and lands on the overview', async () => {
    window.sessionStorage.setItem(
      'cryptoada-login-attempt',
      JSON.stringify({ state: 'abc', codeVerifier: 'v'.repeat(64) }),
    );
    const routes: readonly FakeRoute[] = [
      ...QUIET_ROUTES,
      {
        method: 'POST',
        path: '/v1/session',
        respond: (): Response =>
          dataResponse({ accessToken: 'header.eyJlbWFpbCI6ImFAYi5jIn0.sig', expiresIn: 300 }),
      },
    ];
    const { fake, router } = renderApp({
      path: '/auth/callback?code=the-code&state=abc',
      isAuthenticated: false,
      routes,
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const [call] = fake.callsTo('POST', '/v1/session');
    expect(call?.body).toEqual({
      code: 'the-code',
      codeVerifier: 'v'.repeat(64),
      redirectUri: `${window.location.origin}/auth/callback`,
    });
    expect(window.sessionStorage.getItem('cryptoada-login-attempt')).toBeNull();
  });

  test('refuses a callback whose state does not match and never calls the API', async () => {
    window.sessionStorage.setItem(
      'cryptoada-login-attempt',
      JSON.stringify({ state: 'abc', codeVerifier: 'v'.repeat(64) }),
    );
    const { fake } = renderApp({
      path: '/auth/callback?code=the-code&state=other',
      isAuthenticated: false,
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível entrar');
    expect(fake.callsTo('POST', '/v1/session')).toHaveLength(0);
  });

  test('shows the provider error without exchanging anything', async () => {
    const { fake } = renderApp({
      path: '/auth/callback?error=access_denied',
      isAuthenticated: false,
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível entrar');
    expect(fake.callsTo('POST', '/v1/session')).toHaveLength(0);
  });
});
