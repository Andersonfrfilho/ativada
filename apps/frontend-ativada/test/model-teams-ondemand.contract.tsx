// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { TeamBalcony } from '../src/runs/team-room/balcony/TeamBalcony.component.js';
import { TeamComparison } from '../src/runs/model-teams/TeamComparison.component.js';
import { analystRoutes, createAnalystHarness } from './support/analyst-fixtures.js';
import { errorResponse, type FakeRoute } from './support/fake-fetch.js';
import { findLoadedTeam } from './support/loaded-team.js';
import { LIVE_RUN_ID } from './support/live-tracking-harness.js';
import {
  buildComparisonItem,
  buildNoKeyTeam,
  buildRecommendation,
  buildRunModelTeams,
  buildTeamState,
  buildTeamView,
  createModelTeamsHarness,
  modelTeamsRoutes,
  QUARTER,
  type ModelTeamsHarness,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';
import { createRoomHarness, roomRoutes } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

type Extra = {
  readonly withAnalyst?: boolean;
  readonly overrides?: readonly FakeRoute[];
};

async function openWith(harness: ModelTeamsHarness, extra: Extra = {}): Promise<HTMLElement> {
  const analyst = extra.withAnalyst === false ? [] : analystRoutes(createAnalystHarness());
  renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [
      ...(extra.overrides ?? []),
      ...modelTeamsRoutes(harness, LIVE_RUN_ID),
      ...analyst,
      ...roomRoutes(createRoomHarness()),
    ],
    probe: (
      <LiveMarketProvider>
        <TeamBalcony runId={LIVE_RUN_ID} />
      </LiveMarketProvider>
    ),
  });
  return findLoadedTeam();
}

async function openSheet(team: HTMLElement, name: string): Promise<HTMLElement> {
  fireEvent.click(await within(team).findByRole('button', { name: new RegExp(`^${name}, `) }));
  return screen.getByRole('group', { name: `Ficha de ${name}` });
}

describe('"Pedir opinião agora" (RF20)', () => {
  test('habilitado: pede, mostra "pedido avulso · não entra no placar" e acompanha até decidir', async () => {
    const harness = createModelTeamsHarness(buildRunModelTeams());
    const team = await openWith(harness);
    const sheet = await openSheet(team, 'Nina');
    const button = await within(sheet).findByRole('button', { name: 'Pedir opinião agora' });
    await waitFor(() => expect(button).toHaveProperty('disabled', false));
    const pending = buildRecommendation('nina', {
      id: 'opinion-nina',
      isOnDemand: true,
      onDemandMark: 'pedido avulso · não entra no placar',
      status: 'pending',
      action: null,
      actionLabel: null,
      levels: null,
      roles: null,
      confidence: null,
    });
    harness.state = buildRunModelTeams({
      teams: [
        buildTeamState('nina', { onDemand: [pending] }),
        buildTeamState('lucas'),
        buildTeamState('olivia'),
      ],
    });
    fireEvent.click(button);
    await waitFor(() => expect(harness.opinions).toEqual(['nina']));
    await waitFor(() => expect(sheet.textContent).toContain('Aguardando a resposta da equipe'));
    expect(sheet.textContent).toContain('pedido avulso · não entra no placar');
    harness.state = buildRunModelTeams({
      teams: [
        buildTeamState('nina', {
          onDemand: [{ ...pending, status: 'decided', action: 'sell', actionLabel: 'vender' }],
        }),
        buildTeamState('lucas'),
        buildTeamState('olivia'),
      ],
    });
    await waitFor(() => expect(sheet.textContent).toContain('vender'), { timeout: 3000 });
  });

  test('desabilitado: a frase do motivo aparece (desligada, sem chave, sem analista)', async () => {
    const harness = createModelTeamsHarness(
      buildRunModelTeams({
        teams: [
          buildTeamState('nina', { team: buildTeamView('nina', { isEnabled: false }) }),
          buildTeamState('lucas', { team: buildNoKeyTeam('lucas') }),
          buildTeamState('olivia'),
        ],
      }),
    );
    const team = await openWith(harness);
    const nina = await openSheet(team, 'Nina');
    await waitFor(() =>
      expect(nina.textContent).toContain('Equipe desligada: ligue nas preferências'),
    );
    expect(within(nina).getByRole('button', { name: 'Pedir opinião agora' })).toHaveProperty(
      'disabled',
      true,
    );
    const lucas = await openSheet(team, 'Lucas');
    expect(lucas.textContent).toContain('Indisponível agora: sem chave configurada.');
  });

  test('sem analista na simulação o botão diz por que não pede', async () => {
    const harness = createModelTeamsHarness(buildRunModelTeams());
    const team = await openWith(harness, { withAnalyst: false });
    const sheet = await openSheet(team, 'Olívia');
    await waitFor(() => expect(sheet.textContent).toContain('precisa do analista de risco'));
  });

  test('o limite diário (429) vira frase, sem derrubar nada', async () => {
    const harness = createModelTeamsHarness(buildRunModelTeams());
    const limit: FakeRoute = {
      method: 'POST',
      path: `/v1/runs/${LIVE_RUN_ID}/model-teams/lucas/opinions`,
      respond: (): Response => errorResponse(429, 'MODEL_OPINION_LIMIT_REACHED'),
    };
    const team = await openWith(harness, { overrides: [limit] });
    const sheet = await openSheet(team, 'Lucas');
    const button = await within(sheet).findByRole('button', { name: 'Pedir opinião agora' });
    await waitFor(() => expect(button).toHaveProperty('disabled', false));
    fireEvent.click(button);
    await waitFor(() => expect(sheet.textContent).toContain('Limite de pedidos atingido'));
  });
});

describe('"Equipes × regras" (RF21)', () => {
  function openComparison(harness: ModelTeamsHarness): void {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: modelTeamsRoutes(harness, LIVE_RUN_ID),
      probe: <TeamComparison runId={LIVE_RUN_ID} />,
    });
  }

  test('recolhido não consulta; aberto mostra votos, ações, ✓/✗ em palavra e "ainda aberta"', async () => {
    const harness = createModelTeamsHarness(buildRunModelTeams());
    const base = 1_760_000_000_000 - (1_760_000_000_000 % QUARTER);
    harness.comparison = [
      buildComparisonItem(base),
      buildComparisonItem(base - QUARTER, { next: 'open', nextClose: null }),
    ];
    openComparison(harness);
    const summary = screen.getByText('Equipes × regras');
    expect(summary.closest('details')?.hasAttribute('open')).toBe(false);
    fireEvent.click(summary);
    const table = await screen.findByRole('table');
    const text = table.textContent ?? '';
    expect(text).toContain('Tendência');
    expect(text).toContain('Nina');
    expect(text).toContain('↗ comprar');
    expect(text).toContain('acertou');
    expect(text).toContain('errou');
    expect(text).toContain('sem leitura');
    expect(text).toContain('↗ subiu');
    expect(text).toContain('ainda aberta');
    expect(document.body.textContent).toContain('não mede lucro e não é recomendação');
  });

  test('sem analista as regras dizem "sem analista" e o resto segue', async () => {
    const harness = createModelTeamsHarness(buildRunModelTeams());
    harness.comparison = [buildComparisonItem(1_760_000_000_000, { rules: null })];
    openComparison(harness);
    fireEvent.click(screen.getByText('Equipes × regras'));
    const table = await screen.findByRole('table');
    expect(table.textContent).toContain('sem analista');
    expect(table.textContent).toContain('↗ comprar');
  });
});
