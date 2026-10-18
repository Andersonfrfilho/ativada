// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import {
  hasPendingReport,
  useMyModelTeamsQuery,
  useRequestOpinionMutation,
  useRunModelTeamsQuery,
  useSetModelTeamMutation,
} from '../src/runs/model-teams/model-teams.query.js';
import {
  comparisonItemSchema,
  myModelTeamsSchema,
  runModelTeamsSchema,
} from '../src/runs/model-teams/model-teams.validation.js';
import {
  buildComparisonItem,
  buildRecommendation,
  buildRunModelTeams,
  buildTeamState,
  createModelTeamsHarness,
  modelTeamsRoutes,
  TEAM_NOTICE,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';

afterEach(() => {
  cleanup();
});

const RUN_ID = 'run-live-1';

function Probe(): ReactElement {
  const state = useRunModelTeamsQuery(RUN_ID, true);
  const mine = useMyModelTeamsQuery();
  const opinion = useRequestOpinionMutation();
  const setTeam = useSetModelTeamMutation();
  const label = state.data === undefined ? 'loading' : state.data === null ? 'absent' : 'ready';
  return (
    <div>
      <p data-testid="state">{label}</p>
      <p data-testid="mine">{mine.data?.teams.map((team) => team.isEnabled).join(',')}</p>
      <button type="button" onClick={() => opinion.mutate({ runId: RUN_ID, teamKey: 'nina' })}>
        pedir
      </button>
      <button type="button" onClick={() => setTeam.mutate({ teamKey: 'lucas', isEnabled: true })}>
        ligar
      </button>
    </div>
  );
}

describe('o espelho do contrato (Zod)', () => {
  test('aceita a resposta do servidor e recusa lixo', () => {
    expect(runModelTeamsSchema.safeParse(buildRunModelTeams()).success).toBe(true);
    const badAction = Object.assign(buildRecommendation('nina'), { action: 'vai subir' });
    const withBadAction = buildRunModelTeams({
      teams: [buildTeamState('nina', { recent: [badAction] })],
    });
    expect(runModelTeamsSchema.safeParse(withBadAction).success).toBe(false);
    const badPrice = buildRecommendation('nina', {
      levels: { entryPrice: '1e5', targetPrice: '2', stopPrice: '1' },
    });
    const withBadPrice = buildRunModelTeams({
      teams: [buildTeamState('nina', { recent: [badPrice] })],
    });
    expect(runModelTeamsSchema.safeParse(withBadPrice).success).toBe(false);
    expect(comparisonItemSchema.safeParse(buildComparisonItem(1)).success).toBe(true);
    expect(myModelTeamsSchema.safeParse({ notice: TEAM_NOTICE, teams: [] }).success).toBe(true);
  });

  test('só uma recomendação pendente liga o polling', () => {
    expect(hasPendingReport(buildRunModelTeams())).toBe(false);
    const pending = buildRecommendation('nina', { status: 'pending', action: null });
    expect(
      hasPendingReport(
        buildRunModelTeams({ teams: [buildTeamState('nina', { onDemand: [pending] })] }),
      ),
    ).toBe(true);
    expect(hasPendingReport(null)).toBe(false);
  });
});

describe('as consultas', () => {
  test('execução que não é ao vivo (409) vira "ausente", sem erro', async () => {
    const harness = createModelTeamsHarness('absent');
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: modelTeamsRoutes(harness, RUN_ID),
      probe: <Probe />,
    });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('absent'));
  });

  test('o pedido avulso devolve o id, que passa a ir na consulta; o interruptor manda PATCH', async () => {
    const harness = createModelTeamsHarness(buildRunModelTeams());
    const app = renderApp({
      path: '/',
      isAuthenticated: true,
      routes: modelTeamsRoutes(harness, RUN_ID),
      probe: <Probe />,
    });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'pedir' }));
    await waitFor(() => {
      const calls = app.fake.callsTo('GET', `/v1/runs/${RUN_ID}/model-teams`);
      expect(calls.at(-1)?.query.get('opinionIds')).toBe('opinion-nina');
    });
    fireEvent.click(screen.getByRole('button', { name: 'ligar' }));
    await waitFor(() => expect(harness.patched).toEqual([{ teamKey: 'lucas', enabled: true }]));
  });
});

describe('dinheiro', () => {
  test('nenhum Number() nos arquivos das equipes de modelo e do duelo', () => {
    const roots = ['src/runs/model-teams', 'src/runs/duel'];
    const offenders = roots.flatMap((root) =>
      readdirSync(join(import.meta.dir, '..', root))
        .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
        .filter((name) =>
          /\bNumber\(|parseFloat|toFixed/.test(
            readFileSync(join(import.meta.dir, '..', root, name), 'utf8'),
          ),
        )
        .map((name) => `${root}/${name}`),
    );
    expect(offenders).toEqual([]);
  });
});
