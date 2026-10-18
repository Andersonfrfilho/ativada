// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { duelSchema } from '../src/runs/duel/duel.validation.js';
import { buildDuelChart } from '../src/runs/duel/duel-chart.js';
import { buildRanking } from '../src/runs/duel/duel-ranking.js';
import { DuelCreateCard } from '../src/runs/duel/DuelCreateCard.component.js';
import {
  buildDuel,
  createDuelRoutes,
  DUEL_ID,
  duelRoute,
  type CreatedBodies,
} from './support/duel-fixtures.js';
import {
  buildNoKeyTeam,
  buildTeamView,
  createModelTeamsHarness,
  buildRunModelTeams,
  modelTeamsRoutes,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';

afterEach(() => {
  cleanup();
});

describe('o espelho do contrato do duelo (Zod)', () => {
  test('aceita a resposta e recusa curva de tamanho diferente das velas', () => {
    expect(duelSchema.safeParse(buildDuel()).success).toBe(true);
    const duel = buildDuel();
    const broken = {
      ...duel,
      curves: [{ runId: 'run-n', equity: ['1'] }, ...duel.curves.slice(1)],
    };
    expect(duelSchema.safeParse(broken).success).toBe(false);
  });
});

describe('gráfico de patrimônio (puro)', () => {
  test('uma linha por execução, vão onde não há ponto, rótulos do eixo com o texto do servidor', () => {
    const model = buildDuelChart(buildDuel());
    expect(model.series.map((item) => item.label)).toEqual([
      '◆ Nina (Gemini)',
      '◆ Lucas (Claude)',
      '● Minha estratégia (regras)',
    ]);
    const lucas = model.series[1];
    expect(lucas?.paths).toHaveLength(2);
    expect(model.series[0]?.paths).toHaveLength(1);
    expect(model.yLabels.map((label) => label.text)).toEqual(['10.250,50', '9.900,00']);
    expect(model.lastTime).toBe(model.firstTime === undefined ? 0 : model.firstTime + 1_800_000);
    expect(model.series[0]?.last).toBe('10250.50000000');
  });

  test('sem nenhum ponto o gráfico diz que espera a primeira vela', () => {
    const empty = buildDuel({ candleTimes: [], curves: [] });
    expect(buildDuelChart(empty).hasPoints).toBe(false);
  });
});

describe('ranking (puro)', () => {
  test('ordena pelo retorno (BigInt), arredonda contra o usuário e traz Wilson e custo de API', () => {
    const lines = buildRanking(buildDuel());
    expect(lines.map((line) => line.label)).toEqual([
      '◆ Nina (Gemini)',
      '● Minha estratégia (regras)',
      '◆ Lucas (Claude)',
    ]);
    expect(lines.map((line) => line.position)).toEqual([1, 2, 3]);
    expect(lines[0]?.returnText).toBe('+2,50%');
    expect(lines[0]?.drawdownText).toBe('5,02%');
    expect(lines[0]?.accuracy?.headline).toBe('20 de 30 acertos (67%)');
    expect(lines[0]?.accuracy?.verdict).toBe('acima da moeda ao ar (50%)');
    expect(lines[0]?.cost).toBe('hoje US$ 0,0109 · mês US$ 0,3270');
    expect(lines[1]?.accuracy).toBeUndefined();
    expect(lines[1]?.cost).toBe('sem custo de API');
    expect(lines[2]?.returnText).toBe('-1,00%');
    expect(lines[2]?.accuracy?.verdict).toContain('poucas previsões (menos de 30)');
  });
});

function openDuel(duel: ReturnType<typeof buildDuel> | 'missing'): void {
  renderApp({ path: `/duelo/${DUEL_ID}`, isAuthenticated: true, routes: [duelRoute(duel)] });
}

describe('tela do duelo (/duelo/:duelId)', () => {
  test('mostra o gráfico único com legenda ◆/●, o ranking e as frases fixas', async () => {
    openDuel(buildDuel());
    const chart = await screen.findByRole('img', { name: /Patrimônio de cada execução/ });
    expect(chart.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
    const legend = screen.getByRole('list', { name: 'Legenda do gráfico' });
    expect(legend.textContent).toContain('◆ Nina (Gemini)');
    expect(legend.textContent).toContain('● Minha estratégia (regras)');
    const table = screen.getByRole('table', { name: 'Ranking do duelo' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Período curto não prova nada');
    expect(text).toContain('não mede lucro e não é recomendação');
    expect(text).toContain('resultado de uma simulação curta, não prova de nada');
    expect(text).toContain('Custo de API');
    expect(within(table).getAllByRole('link', { name: 'Ver a simulação' })).toHaveLength(3);
  });

  test('duelo que não existe (404) diz isso, sem derrubar a tela', async () => {
    openDuel('missing');
    expect(await screen.findByText('Duelo não encontrado.')).toBeDefined();
  });
});

function openCreate(created: CreatedBodies): void {
  const harness = createModelTeamsHarness(buildRunModelTeams());
  harness.myTeams = [
    buildTeamView('nina'),
    buildNoKeyTeam('lucas'),
    buildTeamView('olivia', { isEnabled: false }),
  ];
  const router = createMemoryRouter(
    [
      { path: '/', element: <DuelCreateCard /> },
      { path: '/duelo/:duelId', element: <p>duelo aberto</p> },
    ],
    { initialEntries: ['/'] },
  );
  renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [...createDuelRoutes(created), ...modelTeamsRoutes(harness, 'run-x')],
    probe: <RouterProvider router={router} />,
  });
}

describe('criar duelo (POST /v1/model-duels)', () => {
  test('só equipes ligadas e prontas entram; o corpo leva par, saldo, equipes e a minha estratégia', async () => {
    const created: CreatedBodies = { bodies: [], failWith: undefined };
    openCreate(created);
    fireEvent.click(screen.getByRole('button', { name: 'Montar um duelo' }));
    const nina = await screen.findByRole('checkbox', { name: /Nina/ });
    expect(screen.getByRole('checkbox', { name: /Lucas/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('checkbox', { name: /Olívia/ })).toHaveProperty('disabled', true);
    expect(document.body.textContent).toContain('sem chave configurada');
    expect(document.body.textContent).toContain('desligada: ligue nas preferências');
    const submit = screen.getByRole('button', { name: 'Criar duelo' });
    expect(submit).toHaveProperty('disabled', true);
    fireEvent.click(nina);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Incluir a minha estratégia/ }));
    expect(submit).toHaveProperty('disabled', false);
    fireEvent.click(submit);
    await waitFor(() => expect(created.bodies).toHaveLength(1));
    expect(created.bodies[0]).toEqual({
      symbol: 'BTCUSDT',
      startingBalance: '10000',
      teams: ['nina'],
      withMyStrategy: { strategyVersionId: 'v1' },
    });
    expect(await screen.findByText('duelo aberto')).toBeDefined();
  });

  test('sem vaga de simulação ao vivo: nada é criado e a tela explica', async () => {
    const created: CreatedBodies = { bodies: [], failWith: 'LIVE_RUN_LIMIT_REACHED' };
    openCreate(created);
    fireEvent.click(screen.getByRole('button', { name: 'Montar um duelo' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Nina/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar duelo' }));
    expect((await screen.findByRole('alert')).textContent).toContain('nada foi criado');
  });

  test('saldo inválido desabilita o envio', async () => {
    const created: CreatedBodies = { bodies: [], failWith: undefined };
    openCreate(created);
    fireEvent.click(screen.getByRole('button', { name: 'Montar um duelo' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Nina/ }));
    fireEvent.change(screen.getByLabelText('Saldo fictício de cada execução'), {
      target: { value: '10,5' },
    });
    expect(screen.getByRole('button', { name: 'Criar duelo' })).toHaveProperty('disabled', true);
    expect(created.bodies).toHaveLength(0);
  });
});
