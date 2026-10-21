// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import type { Notice } from '../src/notices/notice.validation.js';
import {
  buildFilledNotice,
  buildNotice,
  createNoticeFeed,
  MINUTE,
  NOTICE_RUN_ID,
} from './support/notice-fixtures.js';
import { renderApp, type RenderedApp } from './support/render-app.js';

const STACK = 'Avisos recentes';

function recent(minutes: number): { readonly occurredAt: string } {
  return { occurredAt: new Date(Date.now() - minutes * MINUTE).toISOString() };
}

function filled(): Notice {
  return buildFilledNotice({ ...recent(1) });
}

function priceAlert(): Notice {
  return buildNotice({
    ...recent(1),
    noticeId: 'price:alert-1',
    runId: null,
    kind: 'price_alert',
    state: 'done',
    title: 'Alerta de preço',
    message: 'LINK/USDT passou de 12,500.',
    detail: null,
  });
}

function mount(runs: readonly Notice[], prices: readonly Notice[] = []): { app: RenderedApp } {
  const feed = createNoticeFeed({ runs, prices });
  const app = renderApp({
    path: '/conta',
    isAuthenticated: true,
    routes: feed.route,
    noticeToastMilliseconds: 60_000,
  });
  return { app };
}

function pathOf(app: RenderedApp): string {
  return app.router.state.location.pathname;
}

afterEach(() => {
  window.localStorage.clear();
  Reflect.deleteProperty(globalThis, 'Notification');
});

describe('clicar no aviso leva à tela (toast, gaveta e notificação do sistema)', () => {
  test('clicar no corpo do toast abre a simulação, some o toast e marca como lido', async () => {
    const feed = createNoticeFeed();
    const app = renderApp({
      path: '/conta',
      isAuthenticated: true,
      routes: feed.route,
      noticeToastMilliseconds: 60_000,
    });
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido' });
    feed.runs = [filled()];
    act(() =>
      app.stream.emit({
        type: 'event',
        runId: NOTICE_RUN_ID,
        kind: 'balance',
        eventId: 'e',
        at: 1,
      }),
    );
    const stack = await waitFor(() => within(screen.getByRole('list', { name: STACK })));
    fireEvent.click(await stack.findByText('COMPRA'));
    await waitFor(() => expect(pathOf(app)).toBe(`/backtests/${NOTICE_RUN_ID}`));
    expect(screen.queryByRole('list', { name: STACK })).toBeNull();
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido' });
  });

  test('clicar no item da gaveta (fora do link) abre a simulação, fecha a gaveta e marca como lido', async () => {
    const { app } = mount([filled()]);
    fireEvent.click(await screen.findByRole('button', { name: 'Avisos: 1 não lido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Avisos' });
    fireEvent.click(within(dialog).getByText('COMPRA'));
    await waitFor(() => expect(pathOf(app)).toBe(`/backtests/${NOTICE_RUN_ID}`));
    expect(screen.queryByRole('dialog', { name: 'Avisos' })).toBeNull();
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido' });
  });

  test('"Ver no gráfico" na gaveta também marca como lido', async () => {
    const { app } = mount([filled()]);
    fireEvent.click(await screen.findByRole('button', { name: 'Avisos: 1 não lido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Avisos' });
    fireEvent.click(within(dialog).getByRole('link', { name: 'Ver no gráfico' }));
    await waitFor(() => expect(pathOf(app)).toBe(`/backtests/${NOTICE_RUN_ID}`));
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido' });
  });

  test('alerta de preço na gaveta leva à página de alertas', async () => {
    const { app } = mount([], [priceAlert()]);
    fireEvent.click(await screen.findByRole('button', { name: 'Avisos: 1 não lido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Avisos' });
    fireEvent.click(await within(dialog).findByText('Alerta de preço'));
    await waitFor(() => expect(pathOf(app)).toBe('/alertas'));
    expect(screen.queryByRole('dialog', { name: 'Avisos' })).toBeNull();
  });

  test('clicar na notificação do sistema foca a janela e navega para a simulação', async () => {
    const created: { onclick: (() => void) | null; closed: boolean }[] = [];
    class FakeNotification {
      static permission = 'granted';
      onclick: (() => void) | null = null;
      closed = false;
      constructor() {
        created.push(this);
      }
      close(): void {
        this.closed = true;
      }
      static requestPermission(): Promise<string> {
        return Promise.resolve('granted');
      }
    }
    Object.defineProperty(globalThis, 'Notification', {
      value: FakeNotification,
      configurable: true,
    });
    window.localStorage.setItem(
      'ativada.notices.anonymous',
      JSON.stringify({ isBrowserEnabled: true }),
    );
    let focused = 0;
    window.focus = (): void => void (focused += 1);
    const feed = createNoticeFeed();
    const app = renderApp({ path: '/conta', isAuthenticated: true, routes: feed.route });
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido' });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    feed.runs = [filled()];
    act(() =>
      app.stream.emit({
        type: 'event',
        runId: NOTICE_RUN_ID,
        kind: 'balance',
        eventId: 'e',
        at: 1,
      }),
    );
    await waitFor(() => expect(created).toHaveLength(1));
    act(() => void created[0]?.onclick?.());
    expect(focused).toBe(1);
    await waitFor(() => expect(pathOf(app)).toBe(`/backtests/${NOTICE_RUN_ID}`));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});
