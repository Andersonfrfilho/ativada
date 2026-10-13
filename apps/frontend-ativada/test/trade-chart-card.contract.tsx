// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { TradeChartCard } from '../src/runs/TradeChartCard.component.js';
import {
  buildClusteredFixtureChart,
  buildFixtureChart,
  FIXTURE_CLUSTER,
  FIXTURE_DAY,
  FIXTURE_FROM,
  FIXTURE_TO,
} from './fixtures/trade-chart.fixture.js';
import {
  dataResponse,
  pageResponse,
  type FakeRoute,
  type RecordedCall,
} from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';
import { buildRun } from './support/run-fixtures.js';
import { buildSummaryResponse } from './support/trade-chart-fixtures.js';

const CHART_PATH = '/v1/runs/run-1/chart';

type CardOptions = {
  readonly search?: string;
  readonly runDays?: number;
  // A faixa efetiva da execução que a API devolve (walk-forward: só as janelas de teste); padrão: o período inteiro.
  readonly runRange?: { readonly from: number; readonly to: number };
  readonly build?: (overrides: Record<string, unknown>) => Record<string, unknown>;
  readonly respondChart?: (call: RecordedCall) => Response | Promise<Response>;
};

function profileRoute(): FakeRoute {
  return {
    method: 'GET',
    path: '/v1/me',
    respond: (): Response =>
      dataResponse({
        id: 'user-1',
        displayName: null,
        displayCurrency: 'BRL',
        timezone: 'America/Sao_Paulo',
        alertTelegramEnabled: false,
        telegramLinked: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
  };
}

function echoedChart(call: RecordedCall, options: CardOptions): Response {
  const build = options.build ?? buildFixtureChart;
  const from = Number(call.query.get('from') ?? FIXTURE_FROM);
  const to = Number(call.query.get('to') ?? FIXTURE_TO);
  const runDays = options.runDays ?? 40;
  const runRange = options.runRange ?? {
    from: FIXTURE_FROM,
    to: FIXTURE_FROM + runDays * FIXTURE_DAY,
  };
  return dataResponse(build({ from, to, runRange }));
}

function showCard(options: CardOptions = {}): {
  readonly router: ReturnType<typeof createMemoryRouter>;
  readonly chartCalls: () => RecordedCall[];
} {
  const runDays = options.runDays ?? 40;
  const routes: FakeRoute[] = [
    profileRoute(),
    {
      method: 'GET',
      path: '/v1/runs/run-1',
      respond: (): Response =>
        dataResponse(
          buildRun({ periodStart: FIXTURE_FROM, periodEnd: FIXTURE_FROM + runDays * FIXTURE_DAY }),
        ),
    },
    {
      method: 'GET',
      path: CHART_PATH,
      respond: (call) => options.respondChart?.(call) ?? echoedChart(call, options),
    },
    {
      method: 'GET',
      path: '/v1/runs/run-1/trade-summary',
      respond: (): Response => dataResponse(buildSummaryResponse()),
    },
    { method: 'GET', path: '/v1/runs/run-1/trades', respond: (): Response => pageResponse([]) },
  ];
  const router = createMemoryRouter(
    [{ path: '/runs/:runId', element: <TradeChartCard runId="run-1" /> }],
    { initialEntries: [`/runs/run-1${options.search ?? ''}`] },
  );
  const rendered = renderApp({
    path: '/',
    isAuthenticated: true,
    routes,
    probe: <RouterProvider router={router} />,
  });
  return { router, chartCalls: () => rendered.fake.callsTo('GET', CHART_PATH) };
}

function rangeSearch(from: number, to: number): string {
  const params = new URLSearchParams({
    de: new Date(from).toISOString(),
    ate: new Date(to).toISOString(),
  });
  return `?${params.toString()}`;
}

function urlRange(router: ReturnType<typeof createMemoryRouter>): {
  de: string | null;
  ate: string | null;
} {
  const params = new URLSearchParams(router.state.location.search);
  return { de: params.get('de'), ate: params.get('ate') };
}

function chartItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-chart-item]'));
}

async function waitForChart(): Promise<void> {
  await screen.findByRole('group', { name: 'Preço e operações' });
}

function rangedCall(calls: RecordedCall[]): RecordedCall | undefined {
  return calls.find((call) => call.query.has('from'));
}

const LAST_WEEK = { from: FIXTURE_TO - 7 * FIXTURE_DAY, to: FIXTURE_TO };

describe('TradeChartCard: dados', () => {
  test('asks the server for one column per pixel of the drawing and no range at first', async () => {
    const { chartCalls } = showCard();
    await waitForChart();
    const call = chartCalls()[0];
    expect(call?.query.get('columns')).toBe('640');
    expect(call?.query.has('from')).toBe(false);
    expect(call?.query.has('to')).toBe(false);
    expect(chartItems()).toHaveLength(6);
  });

  test('says so while loading and when the server fails', async () => {
    showCard({ respondChart: () => new Response('{}', { status: 500 }) });
    expect(screen.getByText('Carregando o gráfico…')).toBeDefined();
    expect(await screen.findByText('Não foi possível carregar o gráfico.')).toBeDefined();
  });
});

describe('TradeChartCard: atalhos e URL', () => {
  test('a shortcut writes the range to the URL in UTC ISO and the chart asks for it', async () => {
    const { router, chartCalls } = showCard();
    await waitForChart();
    fireEvent.click(await screen.findByRole('button', { name: '7 dias' }));
    await waitFor(() => expect(urlRange(router).de).not.toBeNull());
    expect(urlRange(router)).toEqual({
      de: new Date(LAST_WEEK.from).toISOString(),
      ate: new Date(LAST_WEEK.to).toISOString(),
    });
    await waitFor(() =>
      expect(chartCalls().at(-1)?.query.get('from')).toBe(String(LAST_WEEK.from)),
    );
    expect(chartCalls().at(-1)?.query.get('to')).toBe(String(LAST_WEEK.to));
    expect(screen.getByRole('button', { name: '7 dias' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  test('"Tudo" clears the range and the browser back restores the previous one', async () => {
    const { router } = showCard();
    await waitForChart();
    fireEvent.click(await screen.findByRole('button', { name: '1 dia' }));
    await waitFor(() => expect(urlRange(router).de).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Tudo' }));
    await waitFor(() => expect(urlRange(router).de).toBeNull());
    await act(async () => {
      await router.navigate(-1);
    });
    expect(urlRange(router).de).toBe(new Date(FIXTURE_TO - FIXTURE_DAY).toISOString());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '1 dia' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );
    await act(async () => {
      await router.navigate(-1);
    });
    expect(urlRange(router).de).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tudo' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );
  });

  test('a shortcut longer than the run is not offered', async () => {
    showCard({ runDays: 10 });
    await waitForChart();
    await screen.findByRole('button', { name: '7 dias' });
    expect(screen.queryByRole('button', { name: '30 dias' })).toBeNull();
    expect(screen.getByRole('button', { name: '1 dia' })).toBeDefined();
  });

  test('a link with the range opens on it (ISO)', async () => {
    const { chartCalls } = showCard({ search: rangeSearch(LAST_WEEK.from, LAST_WEEK.to) });
    await waitForChart();
    expect(rangedCall(chartCalls())?.query.get('from')).toBe(String(LAST_WEEK.from));
    expect(rangedCall(chartCalls())?.query.get('to')).toBe(String(LAST_WEEK.to));
  });

  test('a link with milliseconds works too', async () => {
    const { chartCalls } = showCard({ search: `?de=${LAST_WEEK.from}&ate=${LAST_WEEK.to}` });
    await waitForChart();
    expect(rangedCall(chartCalls())?.query.get('from')).toBe(String(LAST_WEEK.from));
    expect(rangedCall(chartCalls())?.query.get('to')).toBe(String(LAST_WEEK.to));
  });
});

describe('TradeChartCard: anterior e próximo', () => {
  const middle = { from: FIXTURE_FROM + 10 * FIXTURE_DAY, to: FIXTURE_FROM + 17 * FIXTURE_DAY };

  test('move the range by its own size', async () => {
    const { router } = showCard({ search: rangeSearch(middle.from, middle.to) });
    await waitForChart();
    const next = await screen.findByRole<HTMLButtonElement>('button', { name: /próximo/ });
    await waitFor(() => expect(next.disabled).toBe(false));
    fireEvent.click(next);
    await waitFor(() =>
      expect(urlRange(router).de).toBe(new Date(FIXTURE_FROM + 17 * FIXTURE_DAY).toISOString()),
    );
    expect(urlRange(router).ate).toBe(new Date(FIXTURE_FROM + 24 * FIXTURE_DAY).toISOString());
    fireEvent.click(screen.getByRole('button', { name: /anterior/ }));
    await waitFor(() => expect(urlRange(router).de).toBe(new Date(middle.from).toISOString()));
  });

  test('are disabled at the edges of the period and without a range', async () => {
    showCard({ search: rangeSearch(LAST_WEEK.from, LAST_WEEK.to) });
    await waitForChart();
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /anterior/ }).disabled).toBe(
        false,
      ),
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /próximo/ }).disabled).toBe(true);
  });

  test('without a range in the URL there is nothing to shift', async () => {
    showCard();
    await waitForChart();
    await screen.findByRole('button', { name: '7 dias' });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /anterior/ }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /próximo/ }).disabled).toBe(true);
  });
});

describe('TradeChartCard: campos de data e aproximação', () => {
  test('the date fields show the shown range and write the one you pick', async () => {
    const { router } = showCard({ search: rangeSearch(LAST_WEEK.from, LAST_WEEK.to) });
    await waitForChart();
    const from = await screen.findByLabelText<HTMLInputElement>('De (data em UTC)');
    const to = screen.getByLabelText<HTMLInputElement>('Até (data em UTC)');
    await waitFor(() => expect(from.value).toBe('2026-05-04'));
    expect(to.value).toBe('2026-05-10');
    fireEvent.change(from, { target: { value: '2026-05-06' } });
    await waitFor(() => expect(urlRange(router).de).toBe('2026-05-06T00:00:00.000Z'));
    expect(urlRange(router).ate).toBe(new Date(LAST_WEEK.to).toISOString());
  });

  test('a day outside the run is not accepted', async () => {
    const { router } = showCard({ search: rangeSearch(LAST_WEEK.from, LAST_WEEK.to) });
    await waitForChart();
    const to = await screen.findByLabelText<HTMLInputElement>('Até (data em UTC)');
    await waitFor(() => expect(to.value).toBe('2026-05-10'));
    fireEvent.change(to, { target: { value: '2026-01-01' } });
    expect(urlRange(router).ate).toBe(new Date(LAST_WEEK.to).toISOString());
  });

  test('Enter on a cluster zooms into its range through the URL', async () => {
    const { router } = showCard({ build: buildClusteredFixtureChart });
    await waitForChart();
    fireEvent.keyDown(chartItems()[0] ?? document.body, { key: 'Enter' });
    await waitFor(() =>
      expect(urlRange(router).de).toBe(new Date(FIXTURE_CLUSTER.startTime).toISOString()),
    );
    expect(urlRange(router).ate).toBe(new Date(FIXTURE_CLUSTER.endTime).toISOString());
  });
});

describe('TradeChartCard: sem piscar', () => {
  test('keeps the previous chart on screen while the new range loads', async () => {
    let release: (() => void) | undefined;
    const { chartCalls } = showCard({
      respondChart: (call) =>
        call.query.has('from')
          ? new Promise<Response>((resolve) => {
              release = (): void => resolve(dataResponse(buildFixtureChart()));
            })
          : dataResponse(buildFixtureChart()),
    });
    await waitForChart();
    fireEvent.click(await screen.findByRole('button', { name: '7 dias' }));
    await waitFor(() => expect(chartCalls()).toHaveLength(2));
    expect(chartItems()).toHaveLength(6);
    expect(screen.queryByText('Carregando o gráfico…')).toBeNull();
    release?.();
    await waitFor(() => expect(chartItems()).toHaveLength(6));
  });
});

describe('TradeChartCard: walk-forward (só a faixa de teste)', () => {
  const runRange = { from: FIXTURE_FROM + 10 * FIXTURE_DAY, to: FIXTURE_FROM + 30 * FIXTURE_DAY };

  test('a link range is clamped to the test windows before it reaches the API', async () => {
    const { chartCalls } = showCard({
      runRange,
      search: rangeSearch(FIXTURE_FROM + 5 * FIXTURE_DAY, FIXTURE_FROM + 15 * FIXTURE_DAY),
    });
    await waitForChart();
    const call = rangedCall(chartCalls());
    expect(call?.query.get('from')).toBe(String(runRange.from));
    expect(call?.query.get('to')).toBe(String(FIXTURE_FROM + 15 * FIXTURE_DAY));
  });

  test('a link entirely outside the test windows falls back to the whole range', async () => {
    const { chartCalls } = showCard({
      runRange,
      search: rangeSearch(FIXTURE_FROM, FIXTURE_FROM + 5 * FIXTURE_DAY),
    });
    await waitForChart();
    expect(rangedCall(chartCalls())).toBeUndefined();
    expect(chartItems().length).toBeGreaterThan(0);
  });

  test('a year-1900 start in the link is cut at the beginning of the run', async () => {
    const { chartCalls } = showCard({
      runRange,
      search: `?de=1900-01-01&ate=${new Date(FIXTURE_FROM + 20 * FIXTURE_DAY).toISOString()}`,
    });
    await waitForChart();
    expect(rangedCall(chartCalls())?.query.get('from')).toBe(String(runRange.from));
  });

  test('"anterior" never leaves the test windows and the shortcuts end inside them', async () => {
    const { router, chartCalls } = showCard({
      runRange,
      search: rangeSearch(runRange.from + 3 * FIXTURE_DAY, runRange.from + 10 * FIXTURE_DAY),
    });
    await waitForChart();
    const previous = await screen.findByRole<HTMLButtonElement>('button', { name: /anterior/ });
    await waitFor(() => expect(previous.disabled).toBe(false));
    fireEvent.click(previous);
    await waitFor(() => expect(urlRange(router).de).toBe(new Date(runRange.from).toISOString()));
    expect(urlRange(router).ate).toBe(new Date(runRange.from + 7 * FIXTURE_DAY).toISOString());
    await waitFor(() => expect(previous.disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() =>
      expect(urlRange(router).de).toBe(new Date(runRange.to - 7 * FIXTURE_DAY).toISOString()),
    );
    expect(
      chartCalls().every(
        (call) => Number(call.query.get('from') ?? runRange.from) >= runRange.from,
      ),
    ).toBe(true);
  });

  test('a "De" before the test windows is cut at their start', async () => {
    const { router } = showCard({
      runRange,
      search: rangeSearch(runRange.from + 5 * FIXTURE_DAY, runRange.from + 12 * FIXTURE_DAY),
    });
    await waitForChart();
    const from = await screen.findByLabelText<HTMLInputElement>('De (data em UTC)');
    await waitFor(() => expect(from.value).not.toBe(''));
    fireEvent.change(from, { target: { value: '2026-04-02' } });
    await waitFor(() => expect(urlRange(router).de).toBe(new Date(runRange.from).toISOString()));
  });
});
