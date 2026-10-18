// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, render, screen, within } from '@testing-library/react';

import { LayerBar } from '../src/runs/candle-chart/LayerBar.component.js';
import { ModelTeamsRunProvider } from '../src/runs/model-teams/ModelTeamsRun.context.js';
import { OfficeCorners } from '../src/runs/team-room/office/OfficeCorners.component.js';
import { LIVE_RUN_ID } from './support/live-tracking-harness.js';
import {
  buildNoKeyTeam,
  buildRecommendation,
  buildRunModelTeams,
  buildTeamState,
  buildTeamView,
  createModelTeamsHarness,
  modelTeamsRoutes,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';

const LAYERS = {
  forecast: true,
  trades: true,
  strategyLines: true,
  stopTarget: false,
  levels: true,
  waited: false,
  teams: true,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function openOffice(state: ReturnType<typeof buildRunModelTeams>): void {
  renderApp({
    path: '/',
    isAuthenticated: true,
    routes: modelTeamsRoutes(createModelTeamsHarness(state), LIVE_RUN_ID),
    probe: (
      <ModelTeamsRunProvider runId={LIVE_RUN_ID}>
        <OfficeCorners />
      </ModelTeamsRunProvider>
    ),
  });
}

const OFF = (key: 'nina' | 'lucas' | 'olivia'): ReturnType<typeof buildTeamState> =>
  buildTeamState(key, { team: buildTeamView(key, { isEnabled: false }), recent: [] });

describe('equipes desligadas no escritório', () => {
  test('a sala de vidro lista só as ligadas, com a palavra do estado', async () => {
    openOffice(
      buildRunModelTeams({
        teams: [
          OFF('nina'),
          buildTeamState('lucas', { team: buildNoKeyTeam('lucas'), recent: [] }),
          buildTeamState('olivia', {
            recent: [buildRecommendation('olivia', { action: 'hold', actionLabel: 'esperar' })],
          }),
        ],
      }),
    );
    const olivia = await screen.findByText(/Olívia/);
    expect(olivia.closest('li')?.textContent).toContain('esperar');
    expect(screen.getByText(/Lucas/).closest('li')?.textContent).toContain('sem chave configurada');
    expect(screen.queryByText(/Nina/)).toBeNull();
    expect(document.body.textContent).not.toContain('desligada');
  });

  test('nenhuma ligada: a sala de vidro some por completo (o café fica)', async () => {
    openOffice(buildRunModelTeams({ teams: [OFF('nina'), OFF('lucas'), OFF('olivia')] }));
    await screen.findByText('Café');
    expect(document.querySelector('li[data-team]')).toBeNull();
    expect(document.body.textContent).not.toContain('MODELO');
  });
});

describe('camada "Equipes ◆" do gráfico', () => {
  function bar(hasTeams: boolean): HTMLElement {
    const { container } = render(
      <LayerBar
        layers={LAYERS}
        isLive
        isStrategyTimeframe
        hasTeams={hasTeams}
        onToggle={() => undefined}
      />,
    );
    return container;
  }

  test('com equipe ligada o botão existe', () => {
    expect(within(bar(true)).getByRole('button', { name: /Equipes ◆/ })).toBeDefined();
  });

  test('sem nenhuma equipe ligada o botão não aparece, e as outras camadas ficam', () => {
    const container = bar(false);
    expect(within(container).queryByRole('button', { name: /Equipes ◆/ })).toBeNull();
    expect(within(container).getByRole('button', { name: /Níveis/ })).toBeDefined();
  });
});
