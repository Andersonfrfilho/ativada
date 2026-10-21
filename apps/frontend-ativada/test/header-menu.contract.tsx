// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { renderApp } from './support/render-app.js';

describe('menu do cabeçalho', () => {
  test('o botão Menu abre e fecha o painel e fecha ao navegar por um link', async () => {
    renderApp({ path: '/conta', isAuthenticated: true, routes: [] });
    const button = await screen.findByRole('button', { name: 'Menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(panel).not.toBeNull();
    fireEvent.click(within(panel as HTMLElement).getByRole('link', { name: 'Metas' }));
    await waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('false'));
  });

  test('nav, tema e Sair ficam no mesmo painel (uma linha no desktop)', async () => {
    renderApp({ path: '/conta', isAuthenticated: true, routes: [] });
    const button = await screen.findByRole('button', { name: 'Menu' });
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    const inside = within(panel as HTMLElement);
    expect(inside.getByRole('navigation', { name: 'Principal' })).toBeDefined();
    expect(inside.getByRole('button', { name: 'Sair' })).toBeDefined();
  });
});
