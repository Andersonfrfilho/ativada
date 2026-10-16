// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { TeamBalcony } from '../src/runs/team-room/balcony/TeamBalcony.component.js';
import { findLoadedTeam } from './support/loaded-team.js';
import { LIVE_RUN_ID } from './support/live-tracking-harness.js';
import { renderApp } from './support/render-app.js';
import { createRoomHarness, roomRoutes } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function openBalcony(): Promise<HTMLElement> {
  renderApp({
    path: '/',
    isAuthenticated: true,
    routes: roomRoutes(createRoomHarness()),
    probe: (
      <LiveMarketProvider>
        <TeamBalcony runId={LIVE_RUN_ID} />
      </LiveMarketProvider>
    ),
  });
  return findLoadedTeam();
}

function badgeOf(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('a varanda: a equipe em pé acima do gráfico (spec 011, escritório)', () => {
  test('the six agents wear a badge with name, role and seal, always visible', async () => {
    await openBalcony();
    for (const name of [
      /^Tiago, Especialista em Tendência, regra, Sem medida\. Ver a ficha$/,
      /^Renata, Especialista em Reversão/,
      /^Alice, Analista de Risco sênior, regra, Decide/,
      /^Vitor, Especialista em Volume/,
      /^Sofia, Especialista em Sentimento/,
      /^Otávio, Auditor, regra, Mede/,
    ]) {
      expect(badgeOf(name)).toBeDefined();
    }
  });

  test('each bubble says the vote in words, the reading the server recorded and until when it holds', async () => {
    const team = await openBalcony();
    const text = team.textContent ?? '';
    expect(text).toContain('a favor');
    expect(text).toContain('contra');
    expect(text).toContain('Cruzamento de médias 55');
    expect(text).toMatch(/vale até [0-9]{2}:[0-9]{2}/);
    expect(text).toMatch(/opiniões valem até [0-9]{2}:[0-9]{2}/);
  });

  test('an agent with no vote on the scoreboard says "não vota" and is crossed out on the board notes', async () => {
    const team = await openBalcony();
    expect(within(team).getAllByText('não vota').length).toBeGreaterThan(0);
    fireEvent.click(within(team).getByRole('tab', { name: 'Notas' }));
    const panel = within(team).getByRole('tabpanel');
    expect(panel.querySelector('s')?.textContent).toBe('Sentimento');
  });

  test('the badge opens the sheet on click, Escape closes it and focus goes back to the badge', async () => {
    await openBalcony();
    const badge = badgeOf(/^Renata/);
    fireEvent.click(badge);
    const sheet = screen.getByRole('group', { name: 'Ficha de Renata' });
    expect(sheet.hasAttribute('hidden')).toBe(false);
    expect(badge.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(badge.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(badge);
  });

  test('a technical term in a bubble has a tip with the plain phrase and a screen-numbers example', async () => {
    await openBalcony();
    const button = screen.getByRole('button', { name: 'O que é RSI?' });
    const tip = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(tip?.getAttribute('role')).toBe('tooltip');
    expect(tip?.textContent).toContain('Mede, de 0 a 100');
    expect(tip?.textContent).toContain('Exemplo:');
  });

  test('the model agents are marked as models, coming soon, and never speak or vote', async () => {
    const team = await openBalcony();
    expect(team.textContent).toContain('MODELOS · em breve');
    fireEvent.click(screen.getByRole('button', { name: /^Nina, Notícias, modelo, em breve/ }));
    const sheet = screen.getByRole('group', { name: 'Ficha de Nina' });
    expect(sheet.textContent).toContain('ainda não existe');
    expect(sheet.textContent).toContain('Custo estimado por dia: —');
  });

  test('the animation has its own pause button and the choice is remembered', async () => {
    const team = await openBalcony();
    fireEvent.click(within(team).getByRole('button', { name: 'Pausar animação' }));
    expect(within(team).getByRole('button', { name: 'Continuar animação' })).toBeDefined();
    expect(localStorage.getItem('ativada.team-room')).toContain('"isAnimationOn":false');
  });

  test('the board opens on the protections tab and says why when there is no open position', async () => {
    const team = await openBalcony();
    expect(within(team).getByRole('tab', { name: 'Proteções', selected: true })).toBeDefined();
    expect(team.textContent).toContain('Sem operação aberta');
  });

  test('with an open position the board shows the protection against a drop, the sentence and the target', async () => {
    const harness = createRoomHarness();
    harness.liveStatus = {
      ...harness.liveStatus,
      openPosition: {
        entryPrice: '61000',
        quantity: '0.1',
        targetPrice: '62000',
        stopPrice: '60500',
        openedCandleTime: 1,
      },
    };
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: roomRoutes(harness),
      probe: (
        <LiveMarketProvider>
          <TeamBalcony runId={LIVE_RUN_ID} />
        </LiveMarketProvider>
      ),
    });
    const team = await findLoadedTeam();
    await waitFor(() => expect(team.textContent).toContain('PROTEÇÃO CONTRA QUEDA'));
    expect(team.textContent).toContain('Se cair a 60.500,00, vende aqui');
    expect(team.textContent).toContain('É a regra da simulação, não uma ordem.');
    expect(team.textContent).toContain('Alvo de ganho');
  });

  test('the board keeps the auditor summary on the ranking tab and the sheet toggle for phones', async () => {
    const team = await openBalcony();
    fireEvent.click(within(team).getByRole('tab', { name: 'Ranking' }));
    expect(within(team).getByRole('tab', { name: 'Ranking', selected: true })).toBeDefined();
    await waitFor(() => expect(team.textContent).toContain('Placar da estratégia'));
    expect(team.textContent).toContain('Ranking é desempenho passado, não garantia.');
    expect(
      within(team).getByRole('button', { name: 'Lousa da equipe: proteções e ranking' }),
    ).toBeDefined();
  });
});
