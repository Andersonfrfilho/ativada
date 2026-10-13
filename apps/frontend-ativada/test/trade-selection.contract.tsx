// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { TradeChartCard } from '../src/runs/TradeChartCard.component.js';
import {
  buildFixtureChart,
  FIXTURE_DAY,
  FIXTURE_FROM,
  FIXTURE_TO,
  fillTime,
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

type TradeShape = Record<string, unknown>;

function tradeFor(key: string, openDay: number, closeDay: number): TradeShape {
  return {
    engineKey: key,
    status: 'closed',
    entryPrice: '600',
    quantity: '0.5',
    exitPrice: '610',
    netProfit: '4.2',
    netProfitRate: '0.014',
    exitReason: 'target',
    openedCandleTime: fillTime(openDay),
    closedCandleTime: fillTime(closeDay),
    paid: '300.3',
    received: '304.5',
    fees: '0.6',
  };
}

// As três operações do fixture do gráfico (p1 3→8, p2 14→20, p3 25→29), na ordem em que o servidor as manda.
const FIXTURE_TRADES = [tradeFor('p1', 3, 8), tradeFor('p2', 14, 20), tradeFor('p3', 25, 29)];

function overlaps(trade: TradeShape, call: RecordedCall): boolean {
  const from = Number(call.query.get('from') ?? FIXTURE_FROM);
  const to = Number(call.query.get('to') ?? FIXTURE_TO);
  const times = [trade['openedCandleTime'], trade['closedCandleTime']].map(Number);
  return times.some((moment) => moment >= from && moment < to);
}

type CardOptions = {
  readonly search?: string;
  readonly trades?: readonly TradeShape[];
  readonly chart?: Record<string, unknown>;
  // O servidor de verdade filtra pela faixa; um teste pode devolver a lista inteira para provar a seleção fora dela.
  readonly isFiltered?: boolean;
  readonly runKind?: string;
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

function buildRoutes(options: CardOptions): FakeRoute[] {
  const run = buildRun({
    kind: options.runKind ?? 'backtest',
    periodStart: FIXTURE_FROM,
    periodEnd: FIXTURE_TO,
  });
  return [
    profileRoute(),
    { method: 'GET', path: '/v1/runs/run-1', respond: (): Response => dataResponse(run) },
    {
      method: 'GET',
      path: '/v1/runs/run-1/chart',
      respond: (call): Response =>
        dataResponse(
          options.chart ?? {
            ...buildFixtureChart(),
            from: Number(call.query.get('from') ?? FIXTURE_FROM),
            to: Number(call.query.get('to') ?? FIXTURE_TO),
          },
        ),
    },
    {
      method: 'GET',
      path: '/v1/runs/run-1/trade-summary',
      respond: (): Response => dataResponse(buildSummaryResponse()),
    },
    {
      method: 'GET',
      path: '/v1/runs/run-1/trades',
      respond: (call): Response =>
        pageResponse(
          (options.trades ?? FIXTURE_TRADES).filter(
            (trade) =>
              trade['status'] === (call.query.get('status') ?? trade['status']) &&
              (options.isFiltered === false || overlaps(trade, call)),
          ),
        ),
    },
  ];
}

function showCard(options: CardOptions = {}): {
  readonly router: ReturnType<typeof createMemoryRouter>;
  readonly chartCalls: () => RecordedCall[];
} {
  const router = createMemoryRouter(
    [{ path: '/runs/:runId', element: <TradeChartCard runId="run-1" /> }],
    { initialEntries: [`/runs/run-1${options.search ?? ''}`] },
  );
  const rendered = renderApp({
    path: '/',
    isAuthenticated: true,
    routes: buildRoutes(options),
    probe: <RouterProvider router={router} />,
  });
  return { router, chartCalls: () => rendered.fake.callsTo('GET', '/v1/runs/run-1/chart') };
}

function urlParam(router: ReturnType<typeof createMemoryRouter>, name: string): string | null {
  return new URLSearchParams(router.state.location.search).get(name);
}

function arrows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-chart-item]'));
}

function arrowAt(index: number): HTMLElement {
  const arrow = arrows()[index];
  if (arrow === undefined) throw new Error(`sem seta ${index}`);
  return arrow;
}

function selectedArrows(): HTMLElement[] {
  return arrows().filter((arrow) => arrow.getAttribute('aria-current') === 'true');
}

function dataRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('tbody tr[aria-rowindex]'));
}

function rowAt(rowIndex: number): HTMLElement {
  const row = dataRows().find((item) => item.getAttribute('aria-rowindex') === String(rowIndex));
  if (row === undefined) throw new Error(`sem linha ${rowIndex}`);
  return row;
}

async function waitForReady(): Promise<void> {
  await waitFor(() => expect(arrows().length).toBeGreaterThan(0));
  await waitFor(() => expect(dataRows().length).toBeGreaterThan(0));
}

function selectedRowIndexes(): (string | null)[] {
  return dataRows()
    .filter((row) => row.getAttribute('aria-current') === 'true')
    .map((row) => row.getAttribute('aria-rowindex'));
}

// Ordem de tempo das setas do fixture: p1 compra, p1 venda, p2 compra, p2 venda, p3 compra, p3 venda.
const ARROW = { p1Buy: 0, p1Sell: 1, p2Buy: 2, p2Sell: 3, p3Buy: 4, p3Sell: 5 } as const;

describe('seleção ligada: seta → linha', () => {
  test('clicking an arrow selects its row, writes ?operacao= and marks both arrows', async () => {
    const { router } = showCard();
    await waitForReady();
    fireEvent.click(arrowAt(ARROW.p2Buy));
    await waitFor(() => expect(urlParam(router, 'operacao')).toBe('p2'));
    await waitFor(() => expect(selectedRowIndexes()).toEqual(['3']));
    expect(selectedArrows()).toEqual([arrowAt(ARROW.p2Buy), arrowAt(ARROW.p2Sell)]);
  });

  test('Enter on a sell arrow selects the row of the same trade', async () => {
    const { router } = showCard();
    await waitForReady();
    fireEvent.keyDown(arrowAt(ARROW.p3Sell), { key: 'Enter' });
    await waitFor(() => expect(urlParam(router, 'operacao')).toBe('p3'));
    await waitFor(() => expect(selectedRowIndexes()).toEqual(['4']));
    expect(selectedArrows()).toEqual([arrowAt(ARROW.p3Buy), arrowAt(ARROW.p3Sell)]);
  });

  test('selecting an arrow does not move the range', async () => {
    const week = { from: FIXTURE_TO - 7 * FIXTURE_DAY, to: FIXTURE_TO };
    const search = `?de=${week.from}&ate=${week.to}`;
    const { router } = showCard({ search, isFiltered: false });
    await waitForReady();
    fireEvent.click(arrowAt(0));
    await waitFor(() => expect(urlParam(router, 'operacao')).not.toBeNull());
    expect(urlParam(router, 'de')).toBe(String(week.from));
  });

  test('scrolls the table to a row far from the top and shows it selected', async () => {
    const trades = Array.from({ length: 200 }, (_, index) => tradeFor(`x${index}`, 0, 1));
    const chart = buildFixtureChart({
      markers: [
        {
          positionKey: 'x150',
          side: 'buy',
          candleTime: fillTime(3),
          price: '609',
          quantity: '0.5',
          fee: '0.3',
          amount: '304.8',
        },
      ],
      totals: { buys: 1, sells: 0 },
    });
    showCard({ trades, chart, isFiltered: false });
    await waitForReady();
    expect(dataRows().some((row) => row.getAttribute('aria-rowindex') === '152')).toBe(false);
    fireEvent.click(arrowAt(0));
    await waitFor(() => expect(selectedRowIndexes()).toEqual(['152']));
    const scroller = screen.getByRole('region', { name: 'Tabela de operações' });
    expect(scroller.scrollTop).toBeGreaterThan(0);
    expect(document.querySelectorAll('tr').length).toBeLessThanOrEqual(60);
  });
});

describe('seleção ligada: linha → setas e faixa', () => {
  test('clicking a row marks both arrows and writes ?operacao=, leaving the range alone without one', async () => {
    const { router } = showCard();
    await waitForReady();
    fireEvent.click(rowAt(4));
    await waitFor(() => expect(urlParam(router, 'operacao')).toBe('p3'));
    await waitFor(() => expect(selectedArrows()).toHaveLength(2));
    expect(selectedArrows()).toEqual([arrowAt(ARROW.p3Buy), arrowAt(ARROW.p3Sell)]);
    expect(urlParam(router, 'de')).toBeNull();
    expect(selectedRowIndexes()).toEqual(['4']);
  });

  test('Enter on a row selects it', async () => {
    const { router } = showCard();
    await waitForReady();
    fireEvent.keyDown(rowAt(2), { key: 'Enter' });
    await waitFor(() => expect(urlParam(router, 'operacao')).toBe('p1'));
  });

  test('a trade outside the current range moves the range to be centered on it, keeping the width', async () => {
    const week = { from: FIXTURE_TO - 7 * FIXTURE_DAY, to: FIXTURE_TO };
    const { router, chartCalls } = showCard({
      search: `?de=${week.from}&ate=${week.to}`,
      isFiltered: false,
    });
    await waitForReady();
    fireEvent.click(rowAt(2));
    // p1 vai do dia 3 às 14:00 ao dia 8 às 14:00 (5 dias): o meio é o dia 5,5; a faixa de 7 dias começa 3,5 dia antes.
    const from = fillTime(3) + 2.5 * FIXTURE_DAY - 3.5 * FIXTURE_DAY;
    await waitFor(() => expect(urlParam(router, 'de')).toBe(new Date(from).toISOString()));
    expect(urlParam(router, 'ate')).toBe(new Date(from + 7 * FIXTURE_DAY).toISOString());
    expect(urlParam(router, 'operacao')).toBe('p1');
    await waitFor(() => expect(chartCalls().at(-1)?.query.get('from')).toBe(String(from)));
  });

  test('the range centered on a trade near the start of the run stops at the start of the run', async () => {
    const wide = { from: FIXTURE_FROM + 20 * FIXTURE_DAY, to: FIXTURE_FROM + 40 * FIXTURE_DAY };
    const { router } = showCard({ search: `?de=${wide.from}&ate=${wide.to}`, isFiltered: false });
    await waitForReady();
    fireEvent.click(rowAt(2));
    await waitFor(() => expect(urlParam(router, 'operacao')).toBe('p1'));
    expect(urlParam(router, 'de')).toBe(new Date(FIXTURE_FROM).toISOString());
    expect(urlParam(router, 'ate')).toBe(new Date(FIXTURE_FROM + 20 * FIXTURE_DAY).toISOString());
  });

  test('a link with ?operacao= opens with that row and its arrows selected, and "voltar" undoes the selection', async () => {
    const { router } = showCard({ search: '?operacao=p2' });
    await waitForReady();
    await waitFor(() => expect(selectedRowIndexes()).toEqual(['3']));
    expect(selectedArrows()).toHaveLength(2);
    fireEvent.click(rowAt(4));
    await waitFor(() => expect(urlParam(router, 'operacao')).toBe('p3'));
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(selectedRowIndexes()).toEqual(['3']));
  });
});

describe('cartão montado: aviso fixo e resumo', () => {
  test('a backtest shows the history notice and the summary sentence, with no claim about simulation', async () => {
    showCard({ runKind: 'backtest' });
    const note = await screen.findByRole('note', { name: 'Leia com cuidado sobre as operações' });
    expect(note.textContent).toContain('O passado não promete o futuro');
    expect(note.textContent).not.toContain('nenhum dinheiro real');
    expect(await screen.findByText(/Você pagou 201,21 USDT/)).toBeDefined();
  });

  test('a live simulation shows the same notice and also says no real money was used', async () => {
    showCard({ runKind: 'live_paper' });
    await waitFor(() => {
      const note = screen.getByRole('note', { name: 'Leia com cuidado sobre as operações' });
      expect(note.textContent).toContain('nada aqui é recomendação de investimento');
      expect(note.textContent).toContain('Simulação: nenhum dinheiro real foi usado.');
    });
  });
});
