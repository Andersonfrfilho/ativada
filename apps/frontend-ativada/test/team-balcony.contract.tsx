// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, within } from '@testing-library/react';

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
    probe: <TeamBalcony runId={LIVE_RUN_ID} />,
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

  test('the board keeps the auditor summary on the ranking tab and the sheet toggle for phones', async () => {
    const team = await openBalcony();
    expect(within(team).getByRole('tab', { name: 'Ranking', selected: true })).toBeDefined();
    expect(
      within(team).getByRole('button', { name: 'Lousa da equipe: proteções e ranking' }),
    ).toBeDefined();
  });
});
