// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { dataResponse } from './support/fake-fetch.js';
import { LIVE_BASE, LIVE_RUN_ID, liveRoutes } from './support/live-tracking-harness.js';
import {
  buildRunModelTeams,
  buildTeamState,
  buildTeamView,
  createModelTeamsHarness,
  modelTeamsRoutes,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';
import { createRoomHarness } from './support/team-room-fixtures.js';
import { buildAvailableTeam, buildTradePlan } from './support/trade-plan-fixtures.js';

// Spec 011, Fase 3, S5: a página da simulação ao vivo abre na sala de operações.

const ORIGINAL_MATCH_MEDIA = globalThis.matchMedia;

afterEach(() => {
  cleanup();
  localStorage.clear();
  globalThis.matchMedia = ORIGINAL_MATCH_MEDIA;
});

class FakeMediaQueryList extends EventTarget implements MediaQueryList {
  readonly matches: boolean;
  readonly media: string;
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null;
  constructor(media: string, matches: boolean) {
    super();
    this.media = media;
    this.matches = matches;
  }
  addListener(): void {
    return;
  }
  removeListener(): void {
    return;
  }
}

function fakeMedia(matching: (query: string) => boolean): void {
  globalThis.matchMedia = (query: string): MediaQueryList =>
    new FakeMediaQueryList(query, matching(query));
}

function openRoom(): void {
  const harness = createRoomHarness();
  renderApp({
    path: `/backtests/${LIVE_RUN_ID}`,
    isAuthenticated: true,
    routes: [
      ...liveRoutes(harness),
      {
        method: 'GET',
        path: `${LIVE_BASE}/trade-plan`,
        respond: (): Response => dataResponse(buildTradePlan()),
      },
    ],
  });
}

describe('a sala de operações na simulação ao vivo', () => {
  test('the decision bar and the text list carry the server plan; rule agents repeat the team plan', async () => {
    openRoom();
    const room = await screen.findByRole('region', { name: 'Sala de operações' });
    const list = await within(room).findByRole('region', { name: 'O que cada um acha' });
    await waitFor(() => expect(list.textContent).toContain('103.100,00'));
    expect(list.textContent).toContain('Alice');
    expect(list.textContent).toContain('Lucro previsto no alvo');
    expect(list.textContent).toContain('+7,65 USDT fict.');
    expect(list.textContent).toContain('Plano da equipe: comprar a 100.010,00');
    expect(room.textContent).toContain('Simulação com dinheiro fictício · Tendência, não promessa');
    const board = within(room).getByRole('region', { name: 'Decisão da equipe' });
    expect(board.textContent).toContain('Proteção');
  });

  test('one decision card in the side column; no price board, no strip under the terminal, floor follows the terminal', async () => {
    fakeMedia((query) => query.includes('min-width'));
    openRoom();
    const room = await screen.findByRole('region', { name: 'Sala de operações' });
    await within(room).findByRole('region', { name: 'O que cada um acha' });
    expect(within(room).getAllByRole('region', { name: 'Decisão da equipe' })).toHaveLength(1);
    expect(within(room).queryByRole('region', { name: 'Quadro de preços' })).toBeNull();
    expect(within(room).queryByRole('region', { name: 'Próxima vela' })).toBeNull();
    const card = within(room).getByRole('region', { name: 'Decisão da equipe' });
    expect(card.textContent).toContain('próxima vela');
    expect(card.textContent).toContain('placar +1 · compra a partir de +2');
    expect(card.textContent).toContain('Último fechamento');
    const terminal = within(room).getByRole('region', { name: 'Telão: gráfico da simulação' });
    expect(terminal.contains(card)).toBe(false);
    const floor = room.querySelector('[aria-hidden="true"][data-motion]');
    const order = terminal.compareDocumentPosition(floor ?? terminal);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      card.compareDocumentPosition(floor ?? card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test('the floor is decorative: aria-hidden, nothing focusable, and only one live region for the decision', async () => {
    fakeMedia((query) => query.includes('min-width'));
    openRoom();
    const room = await screen.findByRole('region', { name: 'Sala de operações' });
    await within(room).findByRole('region', { name: 'O que cada um acha' });
    const floor = room
      .querySelector('[aria-hidden="true"][data-motion], [aria-hidden="true"] svg')
      ?.closest('[aria-hidden="true"]');
    expect(floor).not.toBeNull();
    expect(floor?.querySelector('a, button, [tabindex]')).toBeNull();
    expect(room.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(room.querySelector('[style*="left"]')).toBeNull();
  });

  test('with prefers-reduced-motion nothing carries a motion attribute', async () => {
    fakeMedia((query) => query.includes('reduce') || query.includes('min-width'));
    openRoom();
    const room = await screen.findByRole('region', { name: 'Sala de operações' });
    await within(room).findByRole('region', { name: 'O que cada um acha' });
    expect(room.querySelector('[data-motion]')).toBeNull();
  });

  test('at 375 px the floor gives way to the compact desk strip', async () => {
    fakeMedia(() => false);
    openRoom();
    const strip = await screen.findByRole('list', { name: 'A equipe nas mesas' });
    await waitFor(() => expect(strip.textContent).toContain('Alice'));
    expect(screen.getByRole('button', { name: 'Calmo' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
});

describe('o telão só tem o gráfico', () => {
  test('period buttons, date fields and the trades table live in the Operações tab, not on the screen', async () => {
    openRoom();
    const screenRegion = await screen.findByRole('region', { name: 'Telão: gráfico da simulação' });
    expect(within(screenRegion).queryByRole('region', { name: 'Preço e operações' })).toBeNull();
    expect(within(screenRegion).queryByLabelText(/De \(data em UTC\)/)).toBeNull();
    const operations = await screen.findByRole('region', { name: 'Operações' });
    expect(screenRegion.contains(operations)).toBe(false);
    expect(
      within(operations).getByRole('link', { name: /TradingView Lightweight Charts/ }),
    ).toBeTruthy();
  });
});

describe('as equipes ◆ na sala aparecem uma vez em texto', () => {
  test('Olívia has one card in the list, with her plan and the sheet with "Pedir opinião agora"', async () => {
    const harness = createRoomHarness();
    const teams = createModelTeamsHarness(
      buildRunModelTeams({
        teams: [
          buildTeamState('nina', { team: buildTeamView('nina', { isEnabled: false }), recent: [] }),
          buildTeamState('lucas', {
            team: buildTeamView('lucas', { isEnabled: false }),
            recent: [],
          }),
          buildTeamState('olivia'),
        ],
      }),
    );
    renderApp({
      path: `/backtests/${LIVE_RUN_ID}`,
      isAuthenticated: true,
      routes: [
        ...modelTeamsRoutes(teams, LIVE_RUN_ID),
        ...liveRoutes(harness),
        {
          method: 'GET',
          path: `${LIVE_BASE}/trade-plan`,
          respond: (): Response => dataResponse(buildTradePlan(undefined, [buildAvailableTeam()])),
        },
      ],
    });
    const list = await screen.findByRole('region', { name: 'O que cada um acha' });
    const ficha = await within(list).findByRole('button', { name: 'Ver a ficha de Olívia' });
    expect(within(list).getAllByRole('button', { name: /ficha de/ })).toHaveLength(1);
    await waitFor(() => expect(list.textContent).toContain('99.900,00'));
    expect(list.textContent).toContain('Carteira dela: +5,00%');
    fireEvent.click(ficha);
    expect(ficha.getAttribute('aria-expanded')).toBe('true');
    expect(within(list).getByRole('group', { name: 'Ficha de Olívia' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Equipes de modelo na sala' })).toBeNull();
  });
});
