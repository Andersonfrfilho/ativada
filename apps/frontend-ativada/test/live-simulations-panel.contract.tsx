// Copyright (c) 2026 Ada Technology. All rights reserved.
import { beforeEach, describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@ativada/environment';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { FEATURED_RUN_STORAGE_KEY } from '../src/overview/useFeaturedRun.hook.js';
import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { buildLiveStatusResponse } from './support/live-status-fixtures.js';
import { renderApp, type RenderedApp } from './support/render-app.js';

const HOUR = 3_600_000;
const NOW = Date.now();
const LIST_NAME = 'Simulações ao vivo';

function liveRun(id: string, symbol: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    id,
    strategyVersionId: 'sv-1',
    kind: 'live_paper',
    status: 'running',
    symbol,
    timeframe: '1h',
    runParameters: {},
    periodStart: NOW - 48 * HOUR,
    periodEnd: null,
    progress: 0,
    lastCandleTime: NOW - HOUR,
    metrics: null,
    overfitting: null,
    errorCode: null,
    createdAt: '2026-10-09T12:00:00.000Z',
    startedAt: '2026-10-09T12:00:01.000Z',
    goalId: null,
    goalOutcome: null,
    ...overrides,
  };
}

function summaryItem(runId: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    runId,
    strategyName: 'Placar clássico',
    analystMode: null,
    initialBalance: '10000',
    balance: '10000',
    result: '0',
    resultRate: '0',
    buyAndHold: { resultRate: '0.01', differencePoints: '-1', comparison: 'below' },
    buyCount: 0,
    sellCount: 0,
    lastDecisionAt: NOW - 35 * 60_000,
    isWaitingForData: false,
    ...overrides,
  };
}

const LIVE_RUNS = [
  liveRun('link', 'LINKUSDT'),
  liveRun('pepe', 'PEPEUSDT'),
  liveRun('btc', 'BTCUSDT', { stalledSince: NOW - 3 * HOUR }),
];

const SUMMARY = [
  summaryItem('link', { analystMode: 'shadow' }),
  summaryItem('pepe', {
    balance: '10159.80',
    result: '159.80',
    resultRate: '0.01598',
    buyAndHold: { resultRate: '0.005', differencePoints: '1.09', comparison: 'above' },
    buyCount: 3,
    sellCount: 3,
  }),
  summaryItem('btc', { balance: '9900', result: '-100', resultRate: '-0.01' }),
];

const BACKTESTS = [
  {
    ...(liveRun('bt-pepe', 'PEPEUSDT', { kind: 'backtest', status: 'completed' }) as object),
    metrics: {
      initialBalance: '10000',
      finalEquity: '11598',
      totalReturn: { value: '0.1598', reason: null },
      benchmarkReturn: { value: null, reason: 'x' },
      excessReturn: { value: null, reason: 'x' },
      annualizedReturn: { value: null, reason: 'x' },
      sharpe: { value: null, reason: 'x' },
      sortino: { value: null, reason: 'x' },
      winRate: { value: null, reason: 'x' },
      profitFactor: { value: null, reason: 'x' },
      exposure: { value: null, reason: 'x' },
      maxDrawdownAtClose: { depth: '0.1', durationCandles: 3 },
      trades: 3,
      wins: 3,
      losses: 0,
      feesPaid: '1',
      netProfit: '1598',
    },
  },
];

function detail(runId: string, symbol: string): unknown {
  return {
    ...(liveRun(runId, symbol) as object),
    warnings: [],
    queuePosition: null,
    survival: null,
    waitingForData: null,
  };
}

function runRoutes(runId: string, symbol: string): FakeRoute[] {
  return [
    {
      method: 'GET',
      path: `/v1/runs/${runId}`,
      respond: () => dataResponse(detail(runId, symbol)),
    },
    { method: 'GET', path: `/v1/runs/${runId}/equity`, respond: () => pageResponse([]) },
    { method: 'GET', path: `/v1/runs/${runId}/signals`, respond: () => pageResponse([]) },
    {
      method: 'GET',
      path: `/v1/runs/${runId}/live-status`,
      respond: () => dataResponse(buildLiveStatusResponse()),
    },
  ];
}

function routes(summary?: FakeRoute['respond']): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: '/v1/runs',
      respond: (call) =>
        pageResponse(call.query.get('kind') === 'backtest' ? BACKTESTS : LIVE_RUNS),
    },
    {
      method: 'GET',
      path: '/v1/runs/live-summary',
      respond: summary ?? ((): Response => dataResponse({ items: SUMMARY })),
    },
    ...runRoutes('pepe', 'PEPEUSDT'),
    ...runRoutes('link', 'LINKUSDT'),
    ...runRoutes('btc', 'BTCUSDT'),
    { method: 'GET', path: '/v1/markets/candles', respond: () => dataResponse([]) },
  ];
}

function renderOverview(summary?: FakeRoute['respond']): RenderedApp {
  return renderApp({ path: '/', isAuthenticated: true, routes: routes(summary) });
}

async function cards(): Promise<HTMLElement[]> {
  const list = await screen.findByRole('list', { name: LIST_NAME });
  return within(list).getAllByRole('listitem');
}

function titlesOf(items: readonly HTMLElement[]): string[] {
  return items.map((item) => within(item).getByRole('heading').textContent ?? '');
}

beforeEach(() => {
  localStorage.clear();
});

describe('Visão geral: todas as simulações ao vivo lado a lado', () => {
  test('mostra as três, com estado, analista, operações e a última decisão', async () => {
    renderOverview();
    const items = await cards();
    expect(titlesOf(items)).toStrictEqual(['LINK/USDT', 'PEPE/USDT', 'BTC/USDT']);
    await waitFor(() => expect(items[0]?.textContent).toContain('com analista (sombra)'));
    expect(items[0]?.textContent).toContain('Ainda não comprou nem vendeu');
    expect(items[0]?.textContent).toContain('Última decisão há 35 min');
    expect(items[1]?.textContent).toContain('3 compras · 3 vendas');
    expect(items[1]?.textContent).toContain('Ganho: +159,80 USDT (+1,59%)');
    expect(items[1]?.textContent).toContain('À frente de comprar e segurar');
    expect(items[2]?.textContent).toContain('Parada');
    expect(items[2]?.textContent).toContain('Perda: -100,00 USDT');
    expect(items[0]?.textContent).toContain('Sem ganho nem perda: = 0,00 USDT');
  });

  test('a linha de total soma só as simulações ao vivo e avisa que não é uma carteira real', async () => {
    renderOverview();
    await cards();
    const line = await screen.findByText(/Carteira fictícia total:/);
    const total = { parentElement: line.closest('div') };
    await waitFor(() =>
      expect(total.parentElement?.textContent).toContain('saldo somado 30.059,80 USDT'),
    );
    expect(total.parentElement?.textContent).toContain('3 simulações');
    expect(total.parentElement?.textContent).toContain('resultado +59,80 USDT (+0,19%)');
    expect(total.parentElement?.textContent).toContain('saldo fictício de 10.000 USDT');
    expect(total.parentElement?.textContent).toContain('não é uma carteira real');
  });

  test('o destaque padrão é a mais recente que operou e a escolha é lembrada', async () => {
    const app = renderOverview();
    const items = await cards();
    await waitFor(() => expect(app.fake.callsTo('GET', '/v1/runs/pepe').length).toBeGreaterThan(0));
    expect(app.fake.callsTo('GET', '/v1/runs/link')).toHaveLength(0);
    expect(
      within(items[1] as HTMLElement).getByRole('button', { name: /Em destaque abaixo/ }),
    ).toBeDefined();

    fireEvent.click(
      within(items[0] as HTMLElement).getByRole('button', { name: /Ver em destaque/ }),
    );
    await waitFor(() => expect(app.fake.callsTo('GET', '/v1/runs/link').length).toBeGreaterThan(0));
    expect(localStorage.getItem(FEATURED_RUN_STORAGE_KEY)).toBe('link');
    expect(
      within((await cards())[0] as HTMLElement).getByRole('button', { name: /Em destaque abaixo/ }),
    ).toBeDefined();
  });

  test('uma escolha lembrada de uma simulação que não existe mais volta ao padrão', async () => {
    localStorage.setItem(FEATURED_RUN_STORAGE_KEY, 'sumiu');
    const app = renderOverview();
    await cards();
    await waitFor(() => expect(app.fake.callsTo('GET', '/v1/runs/pepe').length).toBeGreaterThan(0));
  });

  test('ordena por resultado e filtra por moeda', async () => {
    renderOverview();
    await cards();
    fireEvent.click(screen.getByRole('button', { name: 'Maior resultado' }));
    expect(titlesOf(await cards())).toStrictEqual(['PEPE/USDT', 'LINK/USDT', 'BTC/USDT']);
    fireEvent.click(screen.getByRole('button', { name: 'BTC/USDT' }));
    expect(titlesOf(await cards())).toStrictEqual(['BTC/USDT']);
    fireEvent.click(screen.getByRole('button', { name: 'Todas as moedas' }));
    expect(titlesOf(await cards())).toHaveLength(3);
  });

  test('o título do cartão leva ao detalhe da simulação', async () => {
    renderOverview();
    const items = await cards();
    const link = within(items[1] as HTMLElement).getByRole('link', { name: 'PEPE/USDT' });
    expect(link.getAttribute('href')).toBe('/backtests/pepe');
  });

  test('o 429 do resumo é explicado e as simulações continuam na tela', async () => {
    renderOverview(() => errorResponse(HTTP_STATUS.TOO_MANY_REQUESTS, 'RATE_LIMITED'));
    const items = await cards();
    expect(items).toHaveLength(3);
    expect(await screen.findByText(/Muitas consultas em pouco tempo/)).toBeDefined();
    expect(items[0]?.textContent).toContain('Carregando o saldo');
  });

  test('os backtests que lucraram ficam recolhidos, separados e só são pedidos ao abrir', async () => {
    const app = renderOverview();
    await cards();
    const backtestCalls = (): number =>
      app.fake.callsTo('GET', '/v1/runs').filter((call) => call.query.get('kind') === 'backtest')
        .length;
    expect(backtestCalls()).toBe(0);
    expect(screen.getByText('Teste no passado, não é ao vivo')).toBeDefined();
    fireEvent.click(screen.getByText(/Mostrar os backtests que lucraram/));
    const list = await screen.findByRole('list', { name: 'Backtests que lucraram' });
    expect(list.textContent).toContain('PEPE/USDT');
    expect(list.textContent).toContain('Ganho +15,98%');
    expect(list.textContent).toContain('3 operações · amostra pequena');
    expect(backtestCalls()).toBe(1);
  });
});
