// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { horizonsSchema } from '../src/horizons/horizon.validation.js';
import { buildStrategy } from './support/run-fixtures.js';
import { dataResponse, jsonResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import {
  buildDailyRow,
  buildIntradayRow,
  buildNoneRecommendedHorizons,
  buildRecommendedHorizons,
} from './support/horizon-fixtures.js';
import { buildEvaluation, buildGoal } from './support/goal-fixtures.js';
import { renderApp } from './support/render-app.js';

function horizonRoutes(body: unknown = buildRecommendedHorizons()): readonly FakeRoute[] {
  return [
    { method: 'GET', path: '/v1/horizons', respond: (): Response => dataResponse(body) },
    {
      method: 'GET',
      path: '/v1/strategies',
      respond: (): Response =>
        pageResponse([buildStrategy({ id: 'strategy-1', name: 'Momentum rápido' })]),
    },
  ];
}

describe('horizons route and menu', () => {
  test('the menu offers "Prazos" and it opens /prazos', async () => {
    const { router } = renderApp({ path: '/', isAuthenticated: true, routes: horizonRoutes() });
    const link = await screen.findByRole('link', { name: 'Prazos' });
    expect(link.getAttribute('href')).toBe('/prazos');
    fireEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe('/prazos'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Prazos' })).toBeDefined();
  });

  test('asks for the first enabled coin and the best strategy per horizon by default', async () => {
    const { fake } = renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes() });
    expect(await screen.findByLabelText('Moeda')).toHaveProperty('value', 'BTCUSDT');
    expect(screen.getByLabelText('Estratégia')).toHaveProperty('value', '');
    await waitFor(() => expect(fake.callsTo('GET', '/v1/horizons')).toHaveLength(1));
    const query = fake.callsTo('GET', '/v1/horizons')[0]?.query;
    expect(query?.get('symbol')).toBe('BTCUSDT');
    expect(query?.has('strategyId')).toBe(false);
  });

  test('reads the coin and the strategy from the URL', async () => {
    const { fake } = renderApp({
      path: '/prazos?symbol=ETHUSDT&strategyId=strategy-1',
      isAuthenticated: true,
      routes: horizonRoutes(),
    });
    await waitFor(() => expect(fake.callsTo('GET', '/v1/horizons')).toHaveLength(1));
    const query = fake.callsTo('GET', '/v1/horizons')[0]?.query;
    expect(query?.get('symbol')).toBe('ETHUSDT');
    expect(query?.get('strategyId')).toBe('strategy-1');
    expect(screen.getByLabelText('Moeda')).toHaveProperty('value', 'ETHUSDT');
    await waitFor(() =>
      expect(screen.getByLabelText('Estratégia')).toHaveProperty('value', 'strategy-1'),
    );
  });

  test('a coin that is not enabled falls back to the first one', async () => {
    const { fake } = renderApp({
      path: '/prazos?symbol=DOGEUSDT',
      isAuthenticated: true,
      routes: horizonRoutes(),
    });
    await waitFor(() => expect(fake.callsTo('GET', '/v1/horizons')).toHaveLength(1));
    expect(fake.callsTo('GET', '/v1/horizons')[0]?.query.get('symbol')).toBe('BTCUSDT');
  });

  test('changing the selectors writes the URL and asks again', async () => {
    const { fake, router } = renderApp({
      path: '/prazos',
      isAuthenticated: true,
      routes: horizonRoutes(),
    });
    fireEvent.change(await screen.findByLabelText('Moeda'), { target: { value: 'ETHUSDT' } });
    await waitFor(() => expect(router.state.location.search).toBe('?symbol=ETHUSDT'));
    await waitFor(() =>
      expect(screen.getByLabelText('Estratégia').querySelectorAll('option')).toHaveLength(2),
    );
    fireEvent.change(screen.getByLabelText('Estratégia'), { target: { value: 'strategy-1' } });
    await waitFor(() =>
      expect(router.state.location.search).toBe('?symbol=ETHUSDT&strategyId=strategy-1'),
    );
    await waitFor(() => expect(fake.callsTo('GET', '/v1/horizons')).toHaveLength(3));
    fireEvent.change(screen.getByLabelText('Estratégia'), { target: { value: '' } });
    await waitFor(() => expect(router.state.location.search).toBe('?symbol=ETHUSDT'));
  });

  test('the strategy list offers "Melhor por prazo" first, then the user strategies', async () => {
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes() });
    await waitFor(() =>
      expect(
        [...screen.getByLabelText('Estratégia').querySelectorAll('option')].map(
          (option) => option.textContent,
        ),
      ).toEqual(['Melhor por prazo', 'Momentum rápido']),
    );
  });
});

function rowsOf(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Prazos comparados' })).getAllByRole('listitem');
}

function rowTitled(title: string): HTMLElement {
  const row = rowsOf().find((item) => within(item).queryByRole('heading', { name: title }));
  if (row === undefined) throw new Error(`linha ${title} não encontrada`);
  return row;
}

function figures(row: HTMLElement, label: string): Record<string, string> {
  const list = within(row).getByLabelText(label);
  return Object.fromEntries(
    [...list.querySelectorAll('div')].map((item) => [
      item.querySelector('dt')?.textContent ?? '',
      item.querySelector('dd')?.textContent ?? '',
    ]),
  );
}

describe('horizon rows (spec 7.2)', () => {
  test('one recommended horizon: fixed order, server sentences as they came, one badge', async () => {
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes() });
    await screen.findByRole('list', { name: 'Prazos comparados' });
    expect(
      rowsOf().map((item) => within(item).getByRole('heading', { level: 3 }).textContent),
    ).toEqual(['15 minutos', '7 dias', '15 dias', '30 dias']);
    expect(rowTitled('7 dias').textContent).toContain(
      'Por 7 dias: em geral -0,1%, positivo em 40% das vezes.',
    );
    expect(rowTitled('30 dias').textContent).toContain(
      'Por 30 dias: em geral +0,4%, positivo em 58% das vezes. É o prazo mais recomendável no histórico.',
    );
    expect(screen.getAllByText('Recomendável')).toHaveLength(1);
    expect(within(rowTitled('30 dias')).getByText('Recomendável')).toBeDefined();
    expect(within(rowTitled('7 dias')).queryByText('Recomendável')).toBeNull();
    expect(
      screen.getByText('O prazo mais recomendável no histórico desta moeda é de 30 dias.'),
    ).toBeDefined();
  });

  test('shows the numbers in plain Portuguese, exactly, for the strategy and for buy and hold', async () => {
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes() });
    await screen.findByRole('list', { name: 'Prazos comparados' });
    const thirty = rowTitled('30 dias');
    expect(figures(thirty, '30 dias com a estratégia')).toEqual({
      'Em geral': '+0,4%',
      'Em quantas vezes deu positivo': '58,0% (232 de 400)',
      'No pior caso': '-7,0%',
    });
    expect(figures(thirty, '30 dias comprando e segurando')).toEqual({
      'Em geral': '+0,2%',
      'Em quantas vezes deu positivo': '51,0%',
      'No pior caso': '-12,0%',
    });
    expect(within(thirty).getByText(/comprar e segurar/)).toBeDefined();
    expect(figures(rowTitled('15 dias'), '15 dias com a estratégia')['Em geral']).toBe('0,0%');
    const tinyGain = within(rowTitled('15 dias')).getByLabelText('15 dias com a estratégia');
    expect(tinyGain.querySelector('dd')?.className).toBe('');
    expect(
      within(thirty).getByLabelText('30 dias com a estratégia').querySelector('dd')?.className,
    ).toBe('positive');
  });

  test('the 15 minute row shows the verdict as text and shape, with fees and trades', async () => {
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes() });
    await screen.findByRole('list', { name: 'Prazos comparados' });
    const quick = rowTitled('15 minutos');
    expect(within(quick).getByText('Não compensa')).toBeDefined();
    expect(quick.textContent).toContain('✕');
    expect(figures(quick, '15 minutos')).toEqual({
      'Resultado depois das taxas': '-1,2%',
      Operações: '41',
      'Taxas pagas': '31,50 USDT',
      'Taxas sobre o ganho bruto': '—',
    });
  });

  test('a 15 minute row that pays off says so', async () => {
    const body = {
      ...buildRecommendedHorizons(),
      rows: [
        buildIntradayRow({
          verdict: 'COMPENSA',
          netReturn: '0.031',
          feeShareOfGross: '0.2',
          message: 'Operar de 15 em 15 minutos: compensou, +3,1% depois das taxas.',
        }),
      ],
    };
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes(body) });
    const row = (await screen.findByRole('heading', { name: '15 minutos' })).closest('li');
    expect(row?.textContent).toContain('Compensa');
    expect(row?.textContent).not.toContain('Não compensa');
    expect(row?.textContent).toContain('+3,1%');
    expect(row?.textContent).toContain('20,0%');
  });

  test('no horizon paid off: the server sentence, no badge, all rows still shown', async () => {
    renderApp({
      path: '/prazos',
      isAuthenticated: true,
      routes: horizonRoutes(buildNoneRecommendedHorizons()),
    });
    expect(
      await screen.findByText('Nenhum prazo compensou no histórico desta moeda.'),
    ).toBeDefined();
    expect(screen.queryByText('Recomendável')).toBeNull();
    expect(rowsOf()).toHaveLength(4);
    expect(figures(rowTitled('30 dias'), '30 dias com a estratégia')['Em geral']).toBe('-3,0%');
  });

  test('a short history is flagged on the row, and a missing rate shows a dash', async () => {
    const body = {
      ...buildRecommendedHorizons(),
      rows: [
        buildDailyRow(30, {
          isShortHistory: true,
          windowCount: 12,
          positiveCount: 7,
          median: null,
        }),
      ],
    };
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes(body) });
    const row = (await screen.findByRole('heading', { name: '30 dias' })).closest('li');
    expect(row?.textContent).toContain('Histórico curto');
    expect(row ? figures(row, '30 dias com a estratégia')['Em geral'] : undefined).toBe('—');
  });

  test('with no strategy there are no rows: only the server sentence', async () => {
    const message = 'Você ainda não tem estratégia para comparar os prazos desta moeda.';
    const body = {
      ...buildRecommendedHorizons(),
      evaluatedStrategies: 0,
      rows: [],
      recommendedHorizonDays: null,
      recommendationMessage: message,
    };
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes(body) });
    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.queryByRole('list', { name: 'Prazos comparados' })).toBeNull();
    expect(screen.queryByText('Como ler esta tela')).toBeNull();
  });
});

describe('horizons screen furniture', () => {
  test('always carries the fixed history notice (RF07)', async () => {
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes() });
    const note = await screen.findByRole('note', { name: 'Leia com cuidado' });
    expect(note.textContent).toContain('O passado não promete o futuro');
    expect(note.textContent).toContain('nada aqui é recomendação de investimento');
  });

  test('"Como ler" is a collapsed disclosure', async () => {
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes() });
    const summary = await screen.findByText('Como ler esta tela');
    const details = summary.closest('details');
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain('No pior caso');
    expect(details?.textContent).toContain(
      'Cada linha mostra a melhor das suas estratégias naquele prazo, escolhida olhando o passado; por isso o resultado real tende a ser um pouco pior.',
    );
  });

  test('says it is loading while the numbers are not there', async () => {
    renderApp({
      path: '/prazos',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/horizons',
          respond: (): Promise<Response> => new Promise<Response>(() => undefined),
        },
      ],
    });
    expect((await screen.findByText('Calculando o histórico…')).getAttribute('role')).toBe(
      'status',
    );
  });

  test('says when the strategy list was cut', async () => {
    const body = { ...buildRecommendedHorizons(), isStrategyListTruncated: true };
    renderApp({ path: '/prazos', isAuthenticated: true, routes: horizonRoutes(body) });
    expect(await screen.findByText(/Só as estratégias mais recentes/)).toBeDefined();
  });
});

describe('horizons response validation', () => {
  test('accepts both spec cases', () => {
    expect(horizonsSchema.safeParse(buildRecommendedHorizons()).success).toBe(true);
    expect(horizonsSchema.safeParse(buildNoneRecommendedHorizons()).success).toBe(true);
  });

  test('refuses what does not fit the contract', () => {
    const valid = buildRecommendedHorizons();
    const bad: unknown[] = [
      { ...valid, rows: 'x' },
      { ...valid, recommendationMessage: undefined },
      { ...valid, rows: [{ kind: 'weekly' }] },
      { ...valid, recommendedHorizonDays: 'trinta' },
    ];
    for (const body of bad) expect(horizonsSchema.safeParse(body).success).toBe(false);
  });

  test('refuses a rate that is not plain decimal text', () => {
    const body = { ...buildRecommendedHorizons(), rows: [buildDailyRow(7, { median: 'NaN' })] };
    expect(horizonsSchema.safeParse(body).success).toBe(false);
  });

  test('an invalid response does not render: it shows the standard error state', async () => {
    renderApp({
      path: '/prazos',
      isAuthenticated: true,
      routes: horizonRoutes({ symbol: 'BTCUSDT', rows: 'lixo' }),
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não foi possível carregar os prazos');
    expect(screen.queryByText(/mais recomendável/)).toBeNull();
  });

  test('a failed request shows the same error state', async () => {
    renderApp({
      path: '/prazos',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/horizons',
          respond: (): Response => jsonResponse({ error: { code: 'X', message: 'x' } }, 500),
        },
        ...horizonRoutes().slice(1),
      ],
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível carregar os prazos',
    );
  });
});

describe('goal to horizons navigation (RF08)', () => {
  function goalRoutes(symbol: string): readonly FakeRoute[] {
    return [
      ...horizonRoutes(),
      {
        method: 'GET',
        path: '/v1/goals/goal-1',
        respond: (): Response => dataResponse(buildGoal({ symbol })),
      },
      {
        method: 'GET',
        path: '/v1/goals/goal-1/evaluation',
        respond: (): Response => dataResponse(buildEvaluation([])),
      },
    ];
  }

  test('the goal screen links to the horizons of the goal pair', async () => {
    const { fake, router } = renderApp({
      path: '/metas/goal-1',
      isAuthenticated: true,
      routes: goalRoutes('ETHUSDT'),
    });
    const link = await screen.findByRole('link', { name: 'Comparar prazos desta moeda' });
    expect(link.getAttribute('href')).toBe('/prazos?symbol=ETHUSDT');
    fireEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe('/prazos'));
    expect(router.state.location.search).toBe('?symbol=ETHUSDT');
    expect(await screen.findByLabelText('Moeda')).toHaveProperty('value', 'ETHUSDT');
    await waitFor(() =>
      expect(fake.callsTo('GET', '/v1/horizons')[0]?.query.get('symbol')).toBe('ETHUSDT'),
    );
  });

  test('there is no link before the goal is known', async () => {
    renderApp({
      path: '/metas/goal-1',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/goals/goal-1',
          respond: (): Promise<Response> => new Promise<Response>(() => undefined),
        },
        {
          method: 'GET',
          path: '/v1/goals/goal-1/evaluation',
          respond: (): Promise<Response> => new Promise<Response>(() => undefined),
        },
      ],
    });
    await screen.findByRole('heading', { level: 1, name: 'Meta' });
    expect(screen.queryByRole('link', { name: 'Comparar prazos desta moeda' })).toBeNull();
  });
});
