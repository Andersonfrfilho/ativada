// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, screen, waitFor, within } from '@testing-library/react';

import { liveStatusSchema } from '../src/runs/live-tracking/live-status.validation.js';
import { projectionsSchema } from '../src/runs/candle-chart/projections.validation.js';
import { teamRunLabel } from '../src/runs/model-teams/run-source-label.js';
import { RunHeader } from '../src/runs/RunHeader.component.js';
import { runDetailSchema, runSchema } from '../src/runs/run.validation.js';
import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { TradingRoom } from '../src/runs/trading-room/TradingRoom.component.js';
import { findRoomModelTeams } from './support/loaded-team.js';
import { buildProjectionsResponse } from './support/candle-chart-fixtures.js';
import { createLiveHarness, LIVE_RUN_ID } from './support/live-tracking-harness.js';
import {
  buildRunModelTeams,
  buildTeamState,
  createModelTeamsHarness,
  modelTeamsRoutes,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';
import { buildRun } from './support/run-fixtures.js';
import { buildRoomLiveStatus, roomRoutes } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const TEAM_TRIGGERS = {
  status: 'unavailable',
  reason: 'team_run',
  message: 'Sem gatilhos de regra: esta simulação segue a leitura de uma equipe de modelo.',
};

describe('execução de equipe: contratos (team_run)', () => {
  test('a execução traz signalSource e duelId; sem eles (regras) continua valendo', () => {
    const team = buildRun({
      signalSource: { kind: 'model_team', team: 'lucas' },
      duelId: 'duel-1',
    });
    expect(runSchema.parse(team).signalSource?.team).toBe('lucas');
    expect(runDetailSchema.safeParse(team).success).toBe(true);
    expect(runSchema.parse(buildRun()).signalSource).toBeUndefined();
    expect(runSchema.parse(buildRun({ signalSource: null })).signalSource).toBeNull();
    const bad = buildRun({ signalSource: { kind: 'model_team', team: 'clara' } });
    expect(runSchema.safeParse(bad).success).toBe(false);
  });

  test('live-status e projeções aceitam o motivo team_run sem derrubar a tela', () => {
    const status = { ...buildRoomLiveStatus([]), triggers: TEAM_TRIGGERS };
    expect(liveStatusSchema.safeParse(status).success).toBe(true);
    const projections = buildProjectionsResponse({
      current: { status: 'unavailable', reason: 'team_run', message: 'Sem tendência do placar.' },
    });
    expect(projectionsSchema.safeParse(projections).success).toBe(true);
  });

  test('o rótulo da equipe substitui o nome da estratégia fixa do sistema', () => {
    expect(teamRunLabel({ team: 'nina' })).toBe('◆ Equipe Nina (Gemini)');
    expect(teamRunLabel({ team: 'olivia' })).toBe('◆ Equipe Olívia (OpenAI)');
    expect(teamRunLabel(null)).toBeUndefined();
    expect(teamRunLabel(undefined)).toBeUndefined();
  });
});

describe('execução de equipe: telas', () => {
  test('o cabeçalho mostra a equipe ◆ e a frase de que não há régua de regra, sem "Estratégia removida"', async () => {
    const run = runSchema.parse(
      buildRun({ kind: 'live_paper', signalSource: { kind: 'model_team', team: 'nina' } }),
    );
    renderApp({ path: '/', isAuthenticated: true, routes: [], probe: <RunHeader run={run} /> });
    const header = await screen.findByRole('banner');
    expect(header.textContent).toContain('◆ Equipe Nina (Gemini)');
    expect(header.textContent).toContain('não há placar nem gatilhos de regra');
    expect(header.textContent).not.toContain('Estratégia removida');
    expect(header.textContent).not.toContain('versão');
  });

  test('a varanda da execução de equipe mostra as equipes ◆ e a explicação, não fica esperando regras', async () => {
    const base = buildRoomLiveStatus([]);
    const live = createLiveHarness({ liveStatus: { ...base, triggers: TEAM_TRIGGERS } });
    const teams = createModelTeamsHarness(
      buildRunModelTeams({
        signalSource: { kind: 'model_team', team: 'nina' },
        teams: [buildTeamState('nina'), buildTeamState('lucas'), buildTeamState('olivia')],
      }),
    );
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [...modelTeamsRoutes(teams, LIVE_RUN_ID), ...roomRoutes(live)],
      probe: (
        <LiveMarketProvider>
          <TradingRoom runId={LIVE_RUN_ID} screen={undefined} />
        </LiveMarketProvider>
      ),
    });
    const room = await screen.findByRole('region', { name: 'Sala de operações' });
    await waitFor(() => expect(room.textContent).toContain('não há placar nem gatilhos de regra'));
    const teamSection = await findRoomModelTeams();
    expect(
      await within(teamSection).findByRole('button', { name: /^Nina, equipe de modelo/ }),
    ).toBeDefined();
    expect(
      within(room).getByRole('region', { name: 'O que cada um acha' }).textContent,
    ).not.toContain('Tiago');
  });
});
