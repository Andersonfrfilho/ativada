// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@cryptoada/environment';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { percentToFraction } from '../src/goals/percent.js';
import {
  dataResponse,
  errorResponse,
  jsonResponse,
  pageResponse,
  type FakeRoute,
} from './support/fake-fetch.js';
import { buildCombination, buildEvaluation, buildGoal } from './support/goal-fixtures.js';
import { renderApp } from './support/render-app.js';
import { buildRun } from './support/run-fixtures.js';

describe('percent to fraction', () => {
  test('moves the point two places, exactly, with no float', () => {
    expect(percentToFraction('3')).toBe('0.03');
    expect(percentToFraction('2.5')).toBe('0.025');
    expect(percentToFraction('12.5')).toBe('0.125');
    expect(percentToFraction('250')).toBe('2.5');
    expect(percentToFraction('0.5')).toBe('0.005');
    expect(percentToFraction('100')).toBe('1');
    expect(percentToFraction('0.07')).toBe('0.0007');
    expect(percentToFraction(' 3 ')).toBe('0.03');
  });

  test('accepts the Brazilian comma like the dot', () => {
    expect(percentToFraction('2,5')).toBe('0.025');
    expect(percentToFraction(' 12,5 ')).toBe('0.125');
  });

  test('refuses anything that is not a plain positive decimal', () => {
    for (const bad of ['', 'abc', '-3', '1e2', '3.', '3,5,1']) {
      expect(percentToFraction(bad)).toBeUndefined();
    }
  });
});

function goalRoutes(extra: readonly FakeRoute[] = []): readonly FakeRoute[] {
  return [
    ...extra,
    { method: 'GET', path: '/v1/goals', respond: (): Response => pageResponse([buildGoal()]) },
    { method: 'GET', path: '/v1/goals/goal-1', respond: (): Response => dataResponse(buildGoal()) },
  ];
}

describe('new goal', () => {
  test('starts with sensible defaults and sends exact fractions, then opens the goal', async () => {
    const { fake, router } = renderApp({
      path: '/metas',
      isAuthenticated: true,
      routes: goalRoutes([
        {
          method: 'POST',
          path: '/v1/goals',
          respond: (): Response => dataResponse(buildGoal({ id: 'goal-new' }), HTTP_STATUS.CREATED),
        },
        {
          method: 'GET',
          path: '/v1/goals/goal-new',
          respond: (): Response => dataResponse(buildGoal({ id: 'goal-new' })),
        },
        {
          method: 'GET',
          path: '/v1/goals/goal-new/evaluation',
          respond: (): Response => dataResponse(buildEvaluation([])),
        },
      ]),
    });
    expect(await screen.findByLabelText('Retorno alvo (%)')).toHaveProperty('value', '3');
    expect(screen.getByLabelText('Prazo (dias)')).toHaveProperty('value', '30');
    expect(screen.getByLabelText('Perda máxima (%)')).toHaveProperty('value', '5');
    fireEvent.change(screen.getByLabelText('Retorno alvo (%)'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('Prazo (dias)'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('Par'), { target: { value: 'ETHUSDT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Declarar meta' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/metas/goal-new'));
    expect(fake.callsTo('POST', '/v1/goals')[0]?.body).toEqual({
      symbol: 'ETHUSDT',
      targetRate: '0.025',
      maxLossRate: '0.05',
      horizonDays: 14,
    });
  });

  test('blocks bad numbers before the API, naming every field', async () => {
    const { fake } = renderApp({ path: '/metas', isAuthenticated: true, routes: goalRoutes() });
    fireEvent.change(await screen.findByLabelText('Retorno alvo (%)'), {
      target: { value: 'tres' },
    });
    fireEvent.change(screen.getByLabelText('Perda máxima (%)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Declarar meta' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Retorno alvo');
    expect(alert.textContent).toContain('Perda máxima');
    expect(fake.callsTo('POST', '/v1/goals')).toHaveLength(0);
  });

  test('the deadline offers the spec presets (7, 14, 30, 60 and 90 days), 30 by default', async () => {
    renderApp({ path: '/metas', isAuthenticated: true, routes: goalRoutes() });
    const select = await screen.findByLabelText('Prazo (dias)');
    expect(select.tagName).toBe('SELECT');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['7 dias', '14 dias', '30 dias', '60 dias', '90 dias']);
    expect(select).toHaveProperty('value', '30');
  });

  test('shows the API problems by field and the limit in words', async () => {
    renderApp({
      path: '/metas',
      isAuthenticated: true,
      routes: goalRoutes([
        {
          method: 'POST',
          path: '/v1/goals',
          respond: (): Response =>
            jsonResponse(
              {
                error: {
                  code: 'REQUEST_VALIDATION_FAILED',
                  message: 'x',
                  details: [{ field: 'targetRate', reason: 'invalid_value' }],
                },
              },
              HTTP_STATUS.BAD_REQUEST,
            ),
        },
      ]),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Declarar meta' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Retorno alvo');
  });

  test('says the goal limit was reached', async () => {
    renderApp({
      path: '/metas',
      isAuthenticated: true,
      routes: goalRoutes([
        {
          method: 'POST',
          path: '/v1/goals',
          respond: (): Response => errorResponse(HTTP_STATUS.CONFLICT, 'GOAL_LIMIT_REACHED'),
        },
      ]),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Declarar meta' }));
    expect((await screen.findByRole('alert')).textContent).toContain('limite de metas');
  });
});

describe('goal list', () => {
  test('lists the goals in plain words, linking to each', async () => {
    renderApp({ path: '/metas', isAuthenticated: true, routes: goalRoutes() });
    const link = await screen.findByRole('link', { name: /BTC\/USDT/ });
    expect(link.textContent).toContain('+3,00% em 30 dias');
    expect(link.textContent).toContain('perda máxima 5,00%');
    expect(link.getAttribute('href')).toBe('/metas/goal-1');
  });

  test('deleting asks first; a goal with simulations says why it stays', async () => {
    const { fake } = renderApp({
      path: '/metas',
      isAuthenticated: true,
      routes: goalRoutes([
        {
          method: 'DELETE',
          path: '/v1/goals/goal-1',
          respond: (): Response => errorResponse(HTTP_STATUS.CONFLICT, 'GOAL_IN_USE'),
        },
      ]),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar meta de BTC/USDT' }));
    expect(fake.callsTo('DELETE', '/v1/goals/goal-1')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: apagar meta de BTC/USDT' }));
    expect((await screen.findByRole('alert')).textContent).toContain('simulações ligadas');
  });
});

const RANKING = buildEvaluation([
  buildCombination(),
  buildCombination({
    rank: 2,
    symbol: 'ETHUSDT',
    isGoalSymbol: false,
    strategy: { id: 'strategy-2', name: 'Minha regra', versionId: 'version-9', version: 3 },
    evaluation: {
      ...(buildCombination()['evaluation'] as object),
      reachRate: '0.1',
      stopRate: '0.45',
      reachedCount: 20,
      stoppedCount: 90,
      medianDaysToTarget: null,
      verdict: 'EVITAR',
    },
    situation: null,
  }),
]);

describe('goal ranking', () => {
  function open(extra: readonly FakeRoute[] = []): ReturnType<typeof renderApp> {
    return renderApp({
      path: '/metas/goal-1',
      isAuthenticated: true,
      routes: goalRoutes([
        {
          method: 'GET',
          path: '/v1/goals/goal-1/evaluation',
          respond: (): Response => dataResponse(RANKING),
        },
        ...extra,
      ]),
    });
  }

  test('ranks strategy x coin with reach rate, stop rate, typical time and the buy-and-hold side by side', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Ranking de estratégias por moeda' });
    const first = within(list).getAllByRole('listitem')[0];
    expect(first?.textContent).toContain('Placar clássico · versão 1');
    expect(first?.textContent).toContain('BTC/USDT');
    expect(first?.textContent).toContain('55,00% das 200 janelas');
    expect(first?.textContent).toContain('parou na perda máxima em 15,00%');
    expect(first?.textContent).toContain('tempo típico 9 dias');
    expect(first?.textContent).toContain('comprar e segurar: 40,00%');
    expect(first?.textContent).toContain('COMPRAR');
    const second = within(list).getAllByRole('listitem')[1];
    expect(second?.textContent).toContain('EVITAR');
    expect(second?.textContent).toContain('sem tempo típico');
  });

  test('says honestly that it is history, never a promise', async () => {
    open();
    const note = await screen.findByRole('note', { name: 'Leia com cuidado' });
    expect(note.textContent).toContain('histórico');
    expect(note.textContent).toContain('não promete');
  });

  test('the filter keeps only the goal pair', async () => {
    open();
    await screen.findByRole('list', { name: 'Ranking de estratégias por moeda' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Só o par da meta' }));
    expect(
      within(screen.getByRole('list', { name: 'Ranking de estratégias por moeda' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(1);
  });

  test('lists what could not be evaluated, with a reason in words', async () => {
    open();
    expect((await screen.findByText(/ETH\/USDT.*histórico com lacunas/)).textContent).toContain(
      'Placar',
    );
  });

  test('"Simular esta meta" creates the live simulation tied to the goal and opens the overview', async () => {
    const created = buildRun({
      id: 'run-live',
      kind: 'live_paper',
      status: 'queued',
      goalId: 'goal-1',
    });
    const { fake, router } = open([
      {
        method: 'POST',
        path: '/v1/runs',
        respond: (): Response => dataResponse(created, HTTP_STATUS.ACCEPTED),
      },
      { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
    ]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Simular esta meta com Placar clássico' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(fake.callsTo('POST', '/v1/runs')[0]?.body).toEqual({
      strategyVersionId: 'version-1',
      kind: 'live_paper',
      symbol: 'BTCUSDT',
      timeframe: '1d',
      goalId: 'goal-1',
    });
  });

  test('links the goal pair to its operation plan with the strategy in the address', async () => {
    open();
    const link = await screen.findByRole('link', { name: 'Ver o plano com Placar clássico' });
    expect(link.getAttribute('href')).toBe('/metas/goal-1/plano?strategyId=strategy-1');
  });

  test('another pair cannot be simulated for this goal, and it says so', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Ranking de estratégias por moeda' });
    const second = within(list).getAllByRole('listitem')[1];
    expect(within(second ?? list).queryByRole('button', { name: /Simular/ })).toBeNull();
    expect(second?.textContent).toContain('a simulação usa o par da meta');
  });

  test('the simulation limit comes back in words', async () => {
    open([
      {
        method: 'POST',
        path: '/v1/runs',
        respond: (): Response => errorResponse(HTTP_STATUS.CONFLICT, 'LIVE_RUN_LIMIT_REACHED'),
      },
    ]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Simular esta meta com Placar clássico' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('máximo de simulações');
  });

  test('shows each coin with its situation now and the next trigger by family', async () => {
    open();
    const coins = await screen.findByRole('region', { name: 'Moedas: situação e próximo gatilho' });
    const bitcoin = within(coins).getByRole('article', { name: 'BTC/USDT' });
    expect(bitcoin.textContent).toContain('Aguardando entrada');
    expect(bitcoin.textContent).toContain('Reversão');
    expect(bitcoin.textContent).toContain('RSI');
    expect(bitcoin.textContent).toContain('faltam 18,20');
    expect(bitcoin.textContent).toContain('Tendência');
    expect(bitcoin.textContent).toContain('0,82%');
    expect(bitcoin.textContent).toContain('indicativo');
  });
});

describe('simulating from the goal screen', () => {
  test('the overview shows the new "Meta ativa" even though it had been loaded empty a moment before', async () => {
    let created = false;
    const run = buildRun({
      id: 'run-live',
      kind: 'live_paper',
      status: 'queued',
      goalId: 'goal-1',
    });
    const { router } = renderApp({
      path: '/',
      isAuthenticated: true,
      routes: goalRoutes([
        {
          method: 'GET',
          path: '/v1/runs',
          respond: (call): Response =>
            pageResponse(created && call.query.get('kind') === 'live_paper' ? [run] : []),
        },
        {
          method: 'POST',
          path: '/v1/runs',
          respond: (): Response => {
            created = true;
            return dataResponse(run, HTTP_STATUS.ACCEPTED);
          },
        },
        {
          method: 'GET',
          path: '/v1/goals/goal-1/evaluation',
          respond: (): Response => dataResponse(RANKING),
        },
        { method: 'GET', path: '/v1/runs/run-live', respond: (): Response => dataResponse(run) },
        {
          method: 'GET',
          path: '/v1/runs/run-live/equity',
          respond: (): Response => pageResponse([]),
        },
        {
          method: 'GET',
          path: '/v1/runs/run-live/signals',
          respond: (): Response => pageResponse([]),
        },
      ]),
    });
    await screen.findByRole('heading', { name: 'Visão geral' });
    expect(screen.queryByRole('region', { name: 'Meta ativa' })).toBeNull();
    void router.navigate('/metas/goal-1');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Simular esta meta com Placar clássico' }),
    );
    expect(await screen.findByRole('region', { name: 'Meta ativa' })).toBeDefined();
  });
});

describe('what the engine leaves empty', () => {
  const EMPTY_EVALUATION = {
    ...(buildCombination()['evaluation'] as object),
    windowCount: 0,
    reachRate: null,
    stopRate: null,
    medianDaysToTarget: null,
    benchmark: { reachRate: null, stopRate: null },
    verdict: 'SEGURAR',
  };

  test('a history with no windows says so instead of failing to load', async () => {
    renderApp({
      path: '/metas/goal-1',
      isAuthenticated: true,
      routes: goalRoutes([
        {
          method: 'GET',
          path: '/v1/goals/goal-1/evaluation',
          respond: (): Response =>
            dataResponse(buildEvaluation([buildCombination({ evaluation: EMPTY_EVALUATION })])),
        },
      ]),
    });
    const list = await screen.findByRole('list', { name: 'Ranking de estratégias por moeda' });
    expect(list.textContent).toContain('histórico curto demais');
    expect(list.textContent).toContain('comprar e segurar: indisponível');
    expect(list.textContent).not.toContain('— chegaram ao alvo');
    expect(list.textContent).toContain('SEGURAR');
  });

  test('of several rules in a family it shows the nearest one that has not voted yet', async () => {
    const situation = buildCombination()['situation'] as {
      triggers: { rules: Record<string, unknown>[] };
    };
    const trend = (
      ruleId: string,
      distanceRate: string,
      current: string,
    ): Record<string, unknown> => ({
      ...situation.triggers.rules[1],
      ruleId,
      distanceRate,
      current,
    });
    const crowded = {
      ...situation,
      triggers: {
        ...situation.triggers,
        rules: [trend('far', '0.0500', '111'), trend('near', '0.0100', '222')],
      },
    };
    renderApp({
      path: '/metas/goal-1',
      isAuthenticated: true,
      routes: goalRoutes([
        {
          method: 'GET',
          path: '/v1/goals/goal-1/evaluation',
          respond: (): Response =>
            dataResponse(buildEvaluation([buildCombination({ situation: crowded })])),
        },
      ]),
    });
    const coins = await screen.findByRole('region', { name: 'Moedas: situação e próximo gatilho' });
    const article = within(coins).getByRole('article', { name: 'BTC/USDT' });
    expect(article.textContent).toContain('agora 222,00');
    expect(article.textContent).not.toContain('agora 111,00');
  });

  test('a rule with no reading (sentiment without a fresh observation) still shows its family', async () => {
    const situation = buildCombination()['situation'] as {
      triggers: { rules: Record<string, unknown>[] };
    };
    const blank = {
      ...situation,
      triggers: {
        ...situation.triggers,
        rules: [
          {
            ...situation.triggers.rules[0],
            family: 'sentiment',
            metric: 'fear_greed_index',
            current: null,
            threshold: null,
            distance: null,
            distanceRate: null,
          },
        ],
      },
    };
    renderApp({
      path: '/metas/goal-1',
      isAuthenticated: true,
      routes: goalRoutes([
        {
          method: 'GET',
          path: '/v1/goals/goal-1/evaluation',
          respond: (): Response =>
            dataResponse(buildEvaluation([buildCombination({ situation: blank })])),
        },
      ]),
    });
    const coins = await screen.findByRole('region', { name: 'Moedas: situação e próximo gatilho' });
    const article = within(coins).getByRole('article', { name: 'BTC/USDT' });
    expect(article.textContent).toContain('Sentimento');
    expect(article.textContent).toContain('sem leitura');
  });
});

describe('active goal on the overview', () => {
  const goalRun = {
    id: 'run-goal',
    status: 'running',
    symbol: 'BTCUSDT',
    timeframe: '1d',
    goalId: 'goal-1',
    goalOutcome: null,
    periodStart: Date.now() - 10 * 86_400_000,
    createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
  };

  function overviewRoutes(run: Record<string, unknown>, equity: string): readonly FakeRoute[] {
    return goalRoutes([
      {
        method: 'GET',
        path: '/v1/runs',
        respond: (call): Response =>
          pageResponse(call.query.get('kind') === 'live_paper' ? [run] : []),
      },
      {
        method: 'GET',
        path: '/v1/runs/run-goal',
        respond: (): Response =>
          dataResponse({
            ...buildRun({ id: 'run-goal', kind: 'live_paper', status: run['status'] }),
            survival: { initialBalance: '10000' },
          }),
      },
      {
        method: 'GET',
        path: '/v1/runs/run-goal/equity',
        respond: (): Response =>
          pageResponse([
            { candleTime: Date.now(), equity, equityAtLow: equity, benchmark: '10000' },
          ]),
      },
      {
        method: 'GET',
        path: '/v1/runs/run-goal/signals',
        respond: (): Response => pageResponse([]),
      },
      { method: 'GET', path: '/v1/markets/candles', respond: (): Response => dataResponse([]) },
    ]);
  }

  test('shows the goal, the progress toward target and stop, the deadline and the pace', async () => {
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes(goalRun, '10200') });
    const card = await screen.findByRole('region', { name: 'Meta ativa' });
    await waitFor(() => expect(card.textContent).toContain('+2,00%'));
    expect(card.textContent).toContain('alvo +3,00%');
    expect(card.textContent).toContain('perda máxima 5,00%');
    expect(card.textContent).toContain('restam 20 dias');
    expect(card.textContent).toContain('No ritmo');
    const bar = within(card).getByRole('progressbar', { name: 'Progresso até o alvo' });
    expect(bar.getAttribute('aria-valuenow')).toBe('67');
  });

  test('below the pace says so', async () => {
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes(goalRun, '10010') });
    const card = await screen.findByRole('region', { name: 'Meta ativa' });
    await waitFor(() => expect(card.textContent).toContain('Abaixo do ritmo'));
  });

  test('a finished goal shows its outcome in words', async () => {
    const reached = { ...goalRun, status: 'completed', goalOutcome: 'goal_reached' };
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes(reached, '10310') });
    const card = await screen.findByRole('region', { name: 'Meta ativa' });
    await waitFor(() => expect(card.textContent).toContain('Meta atingida'));
  });

  test('without equity yet it waits for the first candle', async () => {
    const queued = { ...goalRun, status: 'queued' };
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [
        ...overviewRoutes(queued, '10000').filter((route) => !route.path.endsWith('/equity')),
        {
          method: 'GET',
          path: '/v1/runs/run-goal/equity',
          respond: (): Response => pageResponse([]),
        },
      ],
    });
    const card = await screen.findByRole('region', { name: 'Meta ativa' });
    await waitFor(() => expect(card.textContent).toContain('Aguardando o primeiro candle'));
  });

  test('no goal simulation means no card', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [{ method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) }],
    });
    await screen.findByRole('heading', { name: 'Visão geral' });
    expect(screen.queryByRole('region', { name: 'Meta ativa' })).toBeNull();
  });
});
