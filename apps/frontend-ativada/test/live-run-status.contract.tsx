// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';

import { screen, waitFor, within } from '@testing-library/react';

import { deriveLiveRunState, type LiveRunStatusInput } from '../src/runs/live-run-status.js';
import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { buildGoal } from './support/goal-fixtures.js';
import { renderApp } from './support/render-app.js';
import { buildEquityCsv, buildRun, buildStrategy, buildVersion } from './support/run-fixtures.js';
import { buildLiveStatusResponse } from './support/live-status-fixtures.js';
import { buildRunSection } from './support/live-tracking-harness.js';
import { buildChartResponse, buildSummaryResponse } from './support/trade-chart-fixtures.js';

// 17:20 UTC = 14:20 em São Paulo (UTC−3).
const NOW = Date.parse('2026-10-13T17:20:00.000Z');
const SAO_PAULO = { now: NOW, timeZone: 'America/Sao_Paulo' };
const FIRST_CANDLE = 'Aguardando a primeira vela, que fecha às 15:00 de hoje.';
const RUNNING =
  'Olha o mercado a cada 1 hora. Última decisão às 14:00 de hoje · próxima às 15:00 de hoje.';
const STALLED =
  'Sua simulação está parada desde 13:15. O sistema está tentando retomar; nenhuma operação foi perdida.';

beforeEach(() => setSystemTime(new Date(NOW)));
afterEach(() => setSystemTime());

function input(overrides: Partial<LiveRunStatusInput> = {}): LiveRunStatusInput {
  return {
    kind: 'live_paper',
    status: 'running',
    timeframe: '1h',
    periodStart: Date.parse('2026-10-13T17:00:00.000Z'),
    lastCandleTime: null,
    waitingForData: null,
    stalledSince: undefined,
    ...overrides,
  };
}

describe('the four states of a live simulation', () => {
  test('waiting for the first candle says when it closes, today or tomorrow, in the zone of the user', () => {
    expect(deriveLiveRunState(input(), SAO_PAULO)).toEqual({
      kind: 'waitingFirstCandle',
      text: FIRST_CANDLE,
    });
    const lateNight = {
      now: Date.parse('2026-10-14T01:30:00.000Z'),
      timeZone: 'America/Sao_Paulo',
    };
    const state = deriveLiveRunState(
      input({ timeframe: '4h', periodStart: Date.parse('2026-10-14T00:00:00.000Z') }),
      lateNight,
    );
    expect(state).toEqual({
      kind: 'waitingFirstCandle',
      text: 'Aguardando a primeira vela, que fecha às 01:00 de amanhã.',
    });
  });

  test('once the close has passed without a step it says the candle closed', () => {
    const periodStart = Date.parse('2026-10-13T15:00:00.000Z');
    const state = deriveLiveRunState(input({ periodStart }), SAO_PAULO);
    expect(state).toEqual({
      kind: 'waitingFirstCandle',
      text: 'Aguardando a primeira vela, que fechou às 13:00 de hoje.',
    });
  });

  test('the warm-up candles recorded as steps (opened before periodStart) do not end the wait for the first candle', () => {
    const warmUp = Date.parse('2026-10-13T16:00:00.000Z');
    expect(deriveLiveRunState(input({ lastCandleTime: warmUp }), SAO_PAULO)).toEqual({
      kind: 'waitingFirstCandle',
      text: FIRST_CANDLE,
    });
    const periodStart = Date.parse('2026-10-13T16:00:00.000Z');
    const decided = deriveLiveRunState(
      input({ periodStart, lastCandleTime: periodStart }),
      SAO_PAULO,
    );
    expect(decided).toEqual({ kind: 'running', text: RUNNING });
  });

  test('the first candle comes from periodStart, not from when the run was created or started (a run that sat in the queue)', () => {
    const queued = input({ status: 'queued', periodStart: Date.parse('2026-10-13T17:00:00.000Z') });
    expect(deriveLiveRunState(queued, SAO_PAULO)).toEqual({
      kind: 'waitingFirstCandle',
      text: FIRST_CANDLE,
    });
  });

  test('with a step done it shows the last and the next decision', () => {
    const lastCandleTime = Date.parse('2026-10-13T16:00:00.000Z');
    const periodStart = Date.parse('2026-10-13T15:00:00.000Z');
    expect(deriveLiveRunState(input({ periodStart, lastCandleTime }), SAO_PAULO)).toEqual({
      kind: 'running',
      text: RUNNING,
    });
  });

  test('waiting for data keeps its own state', () => {
    const waitingForData = { since: NOW - 3_000_000, openTime: NOW - 7_200_000 };
    expect(deriveLiveRunState(input({ waitingForData }), SAO_PAULO)).toEqual({
      kind: 'waitingForData',
      since: waitingForData.since,
    });
  });

  test('stalled wins over the rest and names the hour in the zone of the user', () => {
    const stalledSince = Date.parse('2026-10-13T16:15:00.000Z');
    expect(deriveLiveRunState(input({ stalledSince }), SAO_PAULO)).toEqual({
      kind: 'stalled',
      text: STALLED,
    });
    const yesterday = Date.parse('2026-10-12T16:15:00.000Z');
    const earlier = deriveLiveRunState(input({ stalledSince: yesterday }), SAO_PAULO);
    expect(earlier.kind === 'stalled' && earlier.text.includes('desde 13:15 de ontem.')).toBe(true);
  });

  test('has no state when it is not a live simulation in the queue or running', () => {
    expect(deriveLiveRunState(input({ kind: 'backtest' }), SAO_PAULO)).toEqual({ kind: 'none' });
    expect(deriveLiveRunState(input({ status: 'completed' }), SAO_PAULO)).toEqual({ kind: 'none' });
    expect(deriveLiveRunState(input({ timeframe: '1w' }), SAO_PAULO)).toEqual({ kind: 'none' });
  });
});

function summary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'run-live',
    status: 'running',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    periodStart: NOW - 3_600_000,
    goalId: null,
    goalOutcome: null,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown>): Record<string, unknown> {
  return buildRun({
    id: 'run-live',
    kind: 'live_paper',
    status: 'running',
    timeframe: '1h',
    periodEnd: null,
    periodStart: Date.parse('2026-10-13T17:00:00.000Z'),
    createdAt: '2026-10-13T17:05:00.000Z',
    startedAt: '2026-10-13T17:05:01.000Z',
    survival: { initialBalance: '10000' },
    ...overrides,
  });
}

const GOAL_SECTION = {
  targetRate: '0.03',
  targetAmount: '10300',
  remainingAmount: '300',
  remainingRate: '0.03',
  deadlineAt: Date.parse('2026-10-20T17:00:00.000Z'),
  remainingMilliseconds: 0,
  maxLossRate: '0.05',
  floorAmount: '9500',
  lossRoomAmount: '500',
  outcome: null,
  outcomeAt: null,
  message: 'Meta.',
};

function overviewRoutes(
  fields: () => Record<string, unknown>,
  goalId: string | null = null,
): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: '/v1/runs',
      respond: (call): Response =>
        pageResponse(call.query.get('kind') === 'live_paper' ? [summary({ goalId })] : []),
    },
    {
      method: 'GET',
      path: '/v1/runs/run-live',
      respond: (): Response => dataResponse(detail({ ...fields(), goalId })),
    },
    { method: 'GET', path: '/v1/runs/run-live/equity', respond: (): Response => pageResponse([]) },
    { method: 'GET', path: '/v1/runs/run-live/signals', respond: (): Response => pageResponse([]) },
    {
      method: 'GET',
      path: '/v1/runs/run-live/live-status',
      respond: (): Response =>
        dataResponse(
          buildLiveStatusResponse({
            run: buildRunSection({
              periodStart: Date.parse('2026-10-13T17:00:00.000Z'),
              ...fields(),
            }),
            goal: goalId === null ? null : GOAL_SECTION,
          }),
        ),
    },
    { method: 'GET', path: '/v1/markets/candles', respond: (): Response => dataResponse([]) },
    { method: 'GET', path: '/v1/goals/goal-1', respond: (): Response => dataResponse(buildGoal()) },
  ];
}

describe('on the overview balance card', () => {
  test('waiting for the first candle: when it closes, no old phrase, the zone of the user', async () => {
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes(() => ({})) });
    const card = await screen.findByRole('region', { name: 'Saldo da simulação' });
    await waitFor(() => expect(card.textContent).toContain(FIRST_CANDLE));
    expect(card.textContent).toContain('Horários em GMT−3.');
    expect(card.textContent).toContain('O saldo aparece quando a primeira vela fechar.');
    expect(card.textContent).not.toMatch(/primeiro[ ]candle/);
  });

  test('shows the last decision in one sentence and links to the full tracking', async () => {
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes(() => ({})) });
    const card = await screen.findByRole('region', { name: 'Saldo da simulação' });
    await waitFor(() =>
      expect(card.textContent).toContain(
        'Última decisão: esperou às 31/12/2025 22:00. Faltou 1 ponto: o RSI (55) está entre 30 e 70.',
      ),
    );
    const link = within(card).getByRole('link', { name: 'Ver o acompanhamento' });
    expect(link.getAttribute('href')).toBe('/backtests/run-live#acompanhamento');
    expect(screen.getByRole('region', { name: 'Simulação rodando agora' })).toBeDefined();
  });

  test('running: last and next decision', async () => {
    const lastCandleTime = Date.parse('2026-10-13T16:00:00.000Z');
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: overviewRoutes(() => ({
        periodStart: Date.parse('2026-10-13T15:00:00.000Z'),
        lastCandleTime,
      })),
    });
    const card = await screen.findByRole('region', { name: 'Saldo da simulação' });
    await waitFor(() => expect(card.textContent).toContain(RUNNING));
  });

  test('a warm-up candle recorded by the worker (before the creation) keeps the wait for the first candle', async () => {
    const lastCandleTime = Date.parse('2026-10-13T16:00:00.000Z');
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: overviewRoutes(() => ({ lastCandleTime })),
    });
    const card = await screen.findByRole('region', { name: 'Saldo da simulação' });
    await waitFor(() => expect(card.textContent).toContain(FIRST_CANDLE));
    expect(card.textContent).not.toContain('Última decisão às');
  });

  test('waiting for data keeps its text', async () => {
    const waitingForData = { since: Date.parse('2026-10-13T16:30:00.000Z'), openTime: NOW };
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: overviewRoutes(() => ({ waitingForData })),
    });
    expect((await screen.findAllByText('Aguardando dados do mercado')).length).toBe(2);
    const card = screen.getByRole('region', { name: 'Saldo da simulação' });
    expect(card.textContent).toContain('desde 13/10/2026 13:30');
  });

  test('stalled: the badge says Parada, not Rodando, right above the banner', async () => {
    const stalledSince = Date.parse('2026-10-13T16:15:00.000Z');
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: overviewRoutes(() => ({ stalledSince })),
    });
    const card = await screen.findByRole('region', { name: 'Saldo da simulação' });
    await waitFor(() => expect(card.textContent).toContain(STALLED));
    expect(card.querySelector('p')?.textContent).toBe('Parada');
    expect(card.textContent).not.toContain('Rodando');
  });

  test('stalled: a banner with shape and words, and it goes away when the field goes away', async () => {
    let stalledSince: number | undefined = Date.parse('2026-10-13T16:15:00.000Z');
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: overviewRoutes(() => (stalledSince === undefined ? {} : { stalledSince })),
    });
    const banner = await screen.findByText(STALLED);
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Parada.');
    expect(banner.textContent).toContain('⚠');
    stalledSince = undefined;
    // Booleano: um `toBeNull` falho serializa o elemento do DOM e leva segundos por tentativa.
    await waitFor(() => expect(screen.queryByText(STALLED) === null).toBe(true));
    expect(screen.getByText(/Aguardando a primeira vela/)).toBeDefined();
  });
});

describe('on the active goal card', () => {
  test('before any closed candle the goal still shows its target and deadline', async () => {
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes(() => ({}), 'goal-1') });
    const card = await screen.findByRole('region', { name: 'Meta: +3% em 7 dias' });
    await waitFor(() => expect(card.textContent).toContain('Para bater a meta faltam'));
    expect(card.textContent).not.toMatch(/primeiro[ ]candle/);
  });

  test('the stalled simulation shows the banner ONCE (balance card); the pulse line says Parada', async () => {
    const stalledSince = Date.parse('2026-10-13T16:15:00.000Z');
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: overviewRoutes(() => ({ stalledSince }), 'goal-1'),
    });
    const pulse = await screen.findByRole('region', { name: 'Simulação rodando agora' });
    expect(within(pulse).getByText('Parada')).toBeDefined();
    await waitFor(() => expect(screen.getAllByText(STALLED)).toHaveLength(1));
    const balance = screen.getByRole('region', { name: 'Saldo da simulação' });
    expect(within(balance).getByText(STALLED)).toBeDefined();
  });
});

function detailRoutes(run: () => Record<string, unknown>): readonly FakeRoute[] {
  const base = '/v1/runs/run-live';
  return [
    {
      method: 'GET',
      path: '/v1/strategies',
      respond: (): Response => pageResponse([buildStrategy()]),
    },
    {
      method: 'GET',
      path: '/v1/strategies/strategy-1/versions',
      respond: (): Response => pageResponse([buildVersion()]),
    },
    { method: 'GET', path: base, respond: (): Response => dataResponse(run()) },
    {
      method: 'GET',
      path: `${base}/export.csv`,
      respond: (): Response =>
        new Response(buildEquityCsv(50), { headers: { 'Content-Type': 'text/csv' } }),
    },
    { method: 'GET', path: `${base}/windows`, respond: (): Response => pageResponse([]) },
    { method: 'GET', path: `${base}/trades`, respond: (): Response => pageResponse([]) },
    {
      method: 'GET',
      path: `${base}/chart`,
      respond: (): Response => dataResponse(buildChartResponse()),
    },
    {
      method: 'GET',
      path: `${base}/trade-summary`,
      respond: (): Response => dataResponse(buildSummaryResponse()),
    },
  ];
}

describe('on the live simulation detail', () => {
  test('queued or running, it shows the state under "Andamento"', async () => {
    renderApp({
      path: '/backtests/run-live',
      isAuthenticated: true,
      routes: detailRoutes(() => detail({ status: 'queued' })),
    });
    const card = await screen.findByRole('region', { name: 'Andamento' });
    await waitFor(() => expect(card.textContent).toContain(FIRST_CANDLE));
  });

  test('stalled shows the banner', async () => {
    const stalledSince = Date.parse('2026-10-13T16:15:00.000Z');
    renderApp({
      path: '/backtests/run-live',
      isAuthenticated: true,
      routes: detailRoutes(() => detail({ stalledSince })),
    });
    const card = await screen.findByRole('region', { name: 'Andamento' });
    await waitFor(() => expect(within(card).getByText(STALLED)).toBeDefined());
  });

  test('a backtest has none of it', async () => {
    renderApp({
      path: '/backtests/run-live',
      isAuthenticated: true,
      routes: detailRoutes(() => buildRun({ id: 'run-live', status: 'running', kind: 'backtest' })),
    });
    const card = await screen.findByRole('region', { name: 'Andamento' });
    expect(card.textContent).not.toContain('Aguardando a primeira vela');
  });
});
