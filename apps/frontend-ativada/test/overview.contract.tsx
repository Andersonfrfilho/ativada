// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@ativada/environment';
import { screen, waitFor, within } from '@testing-library/react';

import {
  dataResponse,
  errorResponse,
  pageResponse,
  type FakeResponder,
  type FakeRoute,
} from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

const RUN_ID = 'run-1';
const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-11T12:00:00.000Z');

const RUN = {
  id: RUN_ID,
  strategyVersionId: 'sv-1',
  kind: 'live_paper',
  status: 'running',
  symbol: 'BTCUSDT',
  timeframe: '1h',
  runParameters: {},
  periodStart: NOW - 48 * HOUR,
  periodEnd: null,
  progress: 0,
  lastCandleTime: NOW - HOUR,
  metrics: null,
  overfitting: null,
  errorCode: null,
  engineVersion: 'e1',
  signalEngineVersion: 's1',
  metricsVersion: 'm1',
  createdAt: '2026-10-09T12:00:00.000Z',
  startedAt: '2026-10-09T12:00:01.000Z',
  finishedAt: null,
  goalId: null,
  goalOutcome: null,
};

const SURVIVAL_MILESTONE = {
  level: '8000',
  isReached: false,
  reachedAtCandleTime: null,
  elapsedMilliseconds: null,
  progress: '0.5',
};

function detail(waitingForData: unknown): Record<string, unknown> {
  return {
    ...RUN,
    warnings: [],
    queuePosition: null,
    survival: {
      version: 's1',
      initialBalance: '10000',
      floor: SURVIVAL_MILESTONE,
      double: SURVIVAL_MILESTONE,
      lowestEquity: '9900',
      highestEquity: '10500',
      observedUntilCandleTime: NOW - HOUR,
      observedMilliseconds: 48 * HOUR,
    },
    waitingForData,
  };
}

function equityPoint(index: number, equity: string): Record<string, unknown> {
  return {
    candleTime: NOW - (10 - index) * HOUR,
    equity,
    equityAtLow: equity,
    benchmark: '10100.00',
  };
}

function signal(action: string, reason: string, index: number): Record<string, unknown> {
  return {
    candleTime: NOW - (5 - index) * HOUR,
    action,
    score: '3',
    regime: 'trending',
    votes: {},
    indicators: {},
    reason,
  };
}

function candle(close: string, index: number): Record<string, unknown> {
  const openTime = NOW - (30 - index) * HOUR;
  return {
    openTime,
    closeTime: openTime + HOUR - 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: '1',
    tradeCount: 1,
  };
}

function candleResponder(): FakeResponder {
  return (call) => {
    const base = call.query.get('symbol') === 'BTCUSDT' ? 60_000 : 3_000;
    return dataResponse(
      Array.from({ length: 30 }, (_, index) => candle(String(base + index), index)),
    );
  };
}

function overviewRoutes(overrides: {
  readonly waitingForData?: unknown;
  readonly runs?: FakeResponder;
}): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: '/v1/runs',
      respond: overrides.runs ?? ((): Response => pageResponse([RUN])),
    },
    {
      method: 'GET',
      path: `/v1/runs/${RUN_ID}`,
      respond: (): Response => dataResponse(detail(overrides.waitingForData ?? null)),
    },
    {
      method: 'GET',
      path: `/v1/runs/${RUN_ID}/equity`,
      respond: (call): Response => {
        const points = [
          equityPoint(0, '10000.00'),
          equityPoint(1, '10200.00'),
          equityPoint(2, '10420.00'),
        ];
        // Só a ordem decrescente devolve o ponto mais recente primeiro: a crescente é de propósito a errada.
        return call.query.get('order') === 'desc'
          ? pageResponse([...points].reverse())
          : pageResponse(points.slice(0, 1));
      },
    },
    {
      method: 'GET',
      path: `/v1/runs/${RUN_ID}/signals`,
      respond: (call): Response => {
        const signals = [
          signal('BUY', 'Compra 3/4: tendência, MACD e volume confirmam', 0),
          signal('HOLD', 'Neutro: placar entre os limiares', 1),
          signal('SELL', 'Venda 3/4: reversão e RSI esticado', 2),
          signal('HOLD', 'Neutro: sem votos', 3),
        ];
        return call.query.get('order') === 'desc'
          ? pageResponse([...signals].reverse())
          : pageResponse([]);
      },
    },
    { method: 'GET', path: '/v1/markets/candles', respond: candleResponder() },
  ];
}

describe('overview page', () => {
  test('shows the balance, the comparison with buy and hold, and the running state', async () => {
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes({}) });
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeDefined();
    const balance = await screen.findByRole('region', { name: 'Saldo da simulação' });
    expect(balance.textContent).toContain('10.420,00');
    expect(balance.textContent).toContain('+4,20%');
    expect(balance.textContent).toContain('10.000,00');
    expect((await screen.findByText('Rodando')).tagName).toBeDefined();
  });

  test('marks the buys and sells on the balance curve, by shape and not only by colour', async () => {
    const points = [
      equityPoint(0, '10000.00'),
      equityPoint(1, '10200.00'),
      equityPoint(2, '10420.00'),
    ];
    const marked = (action: string, index: number): Record<string, unknown> => ({
      ...signal(action, `${action} marcado`, 0),
      candleTime: points[index]?.['candleTime'],
    });
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: `/v1/runs/${RUN_ID}/equity`,
          respond: (): Response => pageResponse([...points].reverse()),
        },
        {
          method: 'GET',
          path: `/v1/runs/${RUN_ID}/signals`,
          respond: (): Response => pageResponse([marked('SELL', 2), marked('BUY', 1)]),
        },
        ...overviewRoutes({}),
      ],
    });
    const chart = await screen.findByRole('img', {
      name: /Curva do saldo comparada a comprar e segurar/,
    });
    await waitFor(() => expect(chart.querySelectorAll('[data-marker="BUY"]')).toHaveLength(1));
    expect(chart.querySelectorAll('[data-marker="SELL"]')).toHaveLength(1);
    expect(chart.getAttribute('aria-label')).toContain('1 compra');
    expect(chart.getAttribute('aria-label')).toContain('1 venda');
  });

  test('says the simulation is waiting for data when candles are missing', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: overviewRoutes({ waitingForData: { since: NOW - HOUR, openTime: NOW - 2 * HOUR } }),
    });
    expect(await screen.findByText('Aguardando dados do mercado')).toBeDefined();
  });

  test('lists the latest signals with their reason, newest first, in words and not only colour', async () => {
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes({}) });
    const list = await screen.findByRole('list', { name: 'Últimos sinais' });
    const items = within(list).getAllByRole('listitem');
    // Neutro não é aviso: só compra e venda entram, do mais novo para o mais antigo.
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Venda');
    expect(items[0]?.textContent).toContain('reversão e RSI esticado');
    expect(items[1]?.textContent).toContain('Compra');
  });

  test('shows a card per configured coin with the latest price and the 24 h change', async () => {
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes({}) });
    const bitcoin = await screen.findByRole('article', { name: 'BTC/USDT' });
    expect(bitcoin.textContent).toContain('60.029,00');
    expect(bitcoin.textContent).toContain('+0,04%');
    expect(await screen.findByRole('article', { name: 'ETH/USDT' })).toBeDefined();
  });

  test('credits alternative.me for the Fear & Greed Index with a safe external link', async () => {
    renderApp({ path: '/', isAuthenticated: true, routes: overviewRoutes({}) });
    const link = await screen.findByRole('link', { name: 'Fear & Greed Index por alternative.me' });
    expect(link.getAttribute('href')).toBe('https://alternative.me/crypto/fear-and-greed-index/');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  test('explains there is no active simulation, and still credits the source', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: overviewRoutes({ runs: () => pageResponse([]) }),
    });
    expect(await screen.findByText('Nenhuma simulação ativa')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Fear & Greed Index por alternative.me' }),
    ).toBeDefined();
  });

  test('reports a load failure in an alert instead of an empty page', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: overviewRoutes({
        runs: () => errorResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR'),
      }),
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível carregar');
  });
});
