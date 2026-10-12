// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@ativada/environment';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { dataResponse, errorResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp, TEST_EMAIL } from './support/render-app.js';

type ProfileState = { alertTelegramEnabled: boolean; telegramLinked: boolean };

function buildProfile(state: ProfileState): Record<string, unknown> {
  return {
    id: 'u1',
    displayName: null,
    displayCurrency: 'BRL',
    timezone: 'America/Sao_Paulo',
    createdAt: '2026-10-01T10:00:00.000Z',
    ...state,
  };
}

function accountRoutes(state: ProfileState): readonly FakeRoute[] {
  return [
    { method: 'GET', path: '/v1/me', respond: (): Response => dataResponse(buildProfile(state)) },
    {
      method: 'PATCH',
      path: '/v1/me',
      respond: (call): Response => {
        Object.assign(state, call.body);
        return dataResponse(buildProfile(state));
      },
    },
    {
      method: 'POST',
      path: '/v1/me/telegram-link',
      respond: (): Response =>
        dataResponse({ code: 'ABCDE23456', expiresInSeconds: 600 }, HTTP_STATUS.CREATED),
    },
    {
      method: 'DELETE',
      path: '/v1/me/telegram-link',
      respond: (): Response => {
        state.telegramLinked = false;
        return new Response(null, { status: HTTP_STATUS.NO_CONTENT });
      },
    },
    {
      method: 'GET',
      path: '/v1/me/export',
      respond: (): Response =>
        new Response('{"data":{"exportedAt":"2026-10-11T10:00:00.000Z"}}', {
          headers: {
            'Content-Disposition': 'attachment; filename="ativada-export-2026-10-11.json"',
          },
        }),
    },
    {
      method: 'DELETE',
      path: '/v1/session',
      respond: (): Response => new Response(null, { status: HTTP_STATUS.NO_CONTENT }),
    },
  ];
}

describe('account page', () => {
  test('shows the signed-in e-mail and the preferences from the profile', async () => {
    renderApp({
      path: '/conta',
      isAuthenticated: true,
      routes: accountRoutes({ alertTelegramEnabled: true, telegramLinked: false }),
    });
    expect(await screen.findByText(TEST_EMAIL)).toBeDefined();
    const alerts = await screen.findByRole('checkbox', { name: 'Receber alertas no Telegram' });
    expect(alerts).toHaveProperty('checked', true);
  });

  test('turning alerts off sends only that field', async () => {
    const state = { alertTelegramEnabled: true, telegramLinked: false };
    const { fake } = renderApp({
      path: '/conta',
      isAuthenticated: true,
      routes: accountRoutes(state),
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Receber alertas no Telegram' }));
    await waitFor(() => expect(fake.callsTo('PATCH', '/v1/me')).toHaveLength(1));
    expect(fake.callsTo('PATCH', '/v1/me')[0]?.body).toEqual({ alertTelegramEnabled: false });
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Receber alertas no Telegram' })).toHaveProperty(
        'checked',
        false,
      ),
    );
  });

  test('the theme choice is applied to the document and remembered', async () => {
    renderApp({
      path: '/conta',
      isAuthenticated: true,
      routes: accountRoutes({ alertTelegramEnabled: true, telegramLinked: false }),
    });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Tema' }), {
      target: { value: 'dark' },
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('ativada-theme')).toBe('dark');
  });

  test('issues a one-time Telegram code, shows it with its lifetime, and unlinks', async () => {
    const state = { alertTelegramEnabled: true, telegramLinked: false };
    const { fake } = renderApp({
      path: '/conta',
      isAuthenticated: true,
      routes: accountRoutes(state),
    });
    expect(await screen.findByText('Telegram não vinculado')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar código de vínculo' }));
    expect(await screen.findByText('ABCDE23456')).toBeDefined();
    expect(screen.getByText(/10 minutos/)).toBeDefined();
    expect(fake.callsTo('POST', '/v1/me/telegram-link')).toHaveLength(1);

    state.telegramLinked = true;
    fireEvent.click(screen.getByRole('button', { name: 'Já enviei o código' }));
    expect(await screen.findByText('Telegram vinculado')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Desvincular Telegram' }));
    await waitFor(() => expect(fake.callsTo('DELETE', '/v1/me/telegram-link')).toHaveLength(1));
    expect(await screen.findByText('Telegram não vinculado')).toBeDefined();
  });

  test('exports the data through the authenticated endpoint', async () => {
    const { fake } = renderApp({
      path: '/conta',
      isAuthenticated: true,
      routes: accountRoutes({ alertTelegramEnabled: true, telegramLinked: false }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar meus dados' }));
    await waitFor(() => expect(fake.callsTo('GET', '/v1/me/export')).toHaveLength(1));
    expect(await screen.findByText(/ativada-export-2026-10-11\.json/)).toBeDefined();
  });
});

describe('account deletion', () => {
  const DELETE_LABEL = 'Apagar minha conta';

  test('stays disabled until the typed e-mail matches, then deletes and leaves to the login', async () => {
    const routes: readonly FakeRoute[] = [
      ...accountRoutes({ alertTelegramEnabled: true, telegramLinked: false }),
      {
        method: 'DELETE',
        path: '/v1/me',
        respond: (): Response => dataResponse({ status: 'deletion_started' }, HTTP_STATUS.ACCEPTED),
      },
    ];
    const { fake, router } = renderApp({ path: '/conta', isAuthenticated: true, routes });
    const button = await screen.findByRole('button', { name: DELETE_LABEL });
    expect(button).toHaveProperty('disabled', true);
    const field = screen.getByLabelText('Digite seu e-mail para confirmar');
    fireEvent.change(field, { target: { value: 'outra@example.com' } });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.change(field, { target: { value: ` ${TEST_EMAIL.toUpperCase()} ` } });
    expect(button).toHaveProperty('disabled', false);
    fireEvent.click(button);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(fake.callsTo('DELETE', '/v1/me')).toHaveLength(1);
    expect(fake.callsTo('DELETE', '/v1/session')).toHaveLength(1);
  });

  test('asks for a recent sign-in when the API requires re-authentication', async () => {
    const routes: readonly FakeRoute[] = [
      ...accountRoutes({ alertTelegramEnabled: true, telegramLinked: false }),
      {
        method: 'DELETE',
        path: '/v1/me',
        respond: (): Response => errorResponse(HTTP_STATUS.FORBIDDEN, 'REAUTH_REQUIRED'),
      },
    ];
    const { router } = renderApp({ path: '/conta', isAuthenticated: true, routes });
    fireEvent.change(await screen.findByLabelText('Digite seu e-mail para confirmar'), {
      target: { value: TEST_EMAIL },
    });
    fireEvent.click(screen.getByRole('button', { name: DELETE_LABEL }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Entre novamente');
    expect(router.state.location.pathname).toBe('/conta');
  });
});
