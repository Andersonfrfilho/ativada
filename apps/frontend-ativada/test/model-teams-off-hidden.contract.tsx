// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, render, screen, within } from '@testing-library/react';

import { LayerBar } from '../src/runs/candle-chart/LayerBar.component.js';
import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { RoomModelTeams } from './support/model-teams-probe.js';
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
      <LiveMarketProvider>
        <RoomModelTeams runId={LIVE_RUN_ID} />
      </LiveMarketProvider>
    ),
  });
}

const OFF = (key: 'nina' | 'lucas' | 'olivia'): ReturnType<typeof buildTeamState> =>
  buildTeamState(key, { team: buildTeamView(key, { isEnabled: false }), recent: [] });

describe('equipes desligadas na sala de operações', () => {
  test('a sala lista só as ligadas, com a palavra do estado', async () => {
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
    const [olivia] = await screen.findAllByText(/Olívia/);
    expect(olivia?.closest('li')?.textContent).toContain('esperar');
    expect(screen.getAllByText(/Lucas/)[0]?.closest('li')?.textContent).toContain(
      'sem chave configurada',
    );
    expect(screen.queryByRole('button', { name: /^Nina, / })).toBeNull();
    expect(document.body.textContent).not.toContain('desligada');
  });

  test('nenhuma ligada: só o link discreto para Conta, nenhum personagem', async () => {
    openOffice(buildRunModelTeams({ teams: [OFF('nina'), OFF('lucas'), OFF('olivia')] }));
    await screen.findByText('Equipes de modelo (desligadas) · ligar em Conta');
    expect(document.querySelector('li[data-team]')).toBeNull();
    expect(document.body.textContent).not.toContain('EQUIPES DE MODELO');
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
