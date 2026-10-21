// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { dataResponse, type FakeRoute } from './support/fake-fetch.js';
import {
  buildNoKeyTeam,
  buildTeamView,
  createModelTeamsHarness,
  modelTeamsRoutes,
  buildRunModelTeams,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';

afterEach(() => {
  cleanup();
});

const FORBIDDEN = /vai subir|garantid|recomendamos|compre|confiante/i;

const profileRoute: FakeRoute = {
  method: 'GET',
  path: '/v1/me',
  respond: (): Response =>
    dataResponse({
      id: 'u1',
      displayName: null,
      displayCurrency: 'BRL',
      timezone: 'America/Sao_Paulo',
      createdAt: '2026-10-01T10:00:00.000Z',
      alertTelegramEnabled: false,
      telegramLinked: false,
    }),
};

function openAccount(): ReturnType<typeof createModelTeamsHarness> {
  const harness = createModelTeamsHarness(buildRunModelTeams());
  harness.myTeams = [
    buildTeamView('nina', { isEnabled: false }),
    { ...buildNoKeyTeam('lucas'), isEnabled: false },
    buildTeamView('olivia', { isEnabled: false }),
  ];
  renderApp({
    path: '/conta',
    isAuthenticated: true,
    routes: [profileRoute, ...modelTeamsRoutes(harness, 'run-x')],
  });
  return harness;
}

describe('Conta → equipes de modelo (RF15)', () => {
  test('mostra as três equipes, desligadas por padrão, com o estado do provedor em palavra', async () => {
    openAccount();
    const card = await screen.findByRole('region', { name: 'Equipes de modelo' });
    await waitFor(() => expect(within(card).getAllByRole('switch')).toHaveLength(3));
    const nina = within(card).getByRole('switch', { name: 'Equipe Nina: desligada' });
    expect(nina).toHaveProperty('checked', false);
    expect(card.textContent).toContain('Gemini Pro · nuvem do Google');
    expect(card.textContent).toContain('sem chave configurada');
    expect(card.textContent).toContain('pronto');
    expect(card.textContent).toContain('Todas começam desligadas');
    expect(card.textContent).toContain('Tendência, não promessa');
    expect(FORBIDDEN.test(card.textContent ?? '')).toBe(false);
  });

  test('o interruptor liga a equipe no servidor e a palavra muda (teclado: o clique do Espaço)', async () => {
    const harness = openAccount();
    const lucas = await screen.findByRole('switch', { name: 'Equipe Lucas: desligada' });
    fireEvent.click(lucas);
    await waitFor(() => expect(harness.patched).toEqual([{ teamKey: 'lucas', enabled: true }]));
    await screen.findByRole('switch', { name: 'Equipe Lucas: ligada' });
  });

  test('o interruptor é focável e tem a área de toque do rótulo', async () => {
    openAccount();
    const olivia = await screen.findByRole('switch', { name: 'Equipe Olívia: desligada' });
    olivia.focus();
    expect(document.activeElement).toBe(olivia);
    expect(olivia.closest('label')).not.toBeNull();
  });
});
