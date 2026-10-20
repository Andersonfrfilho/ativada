// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, screen, waitFor, within } from '@testing-library/react';

import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

const MINUTE = 60_000;
const MINUTE_CANDLE_COUNT = 25;

function candlesOf(params: {
  readonly timeframe: string;
  readonly count: number;
}): Record<string, unknown>[] {
  const now = Date.now();
  const duration = params.timeframe === '1m' ? MINUTE : 15 * MINUTE;
  return Array.from({ length: params.count }, (_, index) => {
    const closeTime = now - 30_000 - (params.count - 1 - index) * duration;
    return {
      openTime: closeTime - duration + 1,
      closeTime,
      open: '100',
      high: '100',
      low: '100',
      close: '100',
      volume: '1',
      tradeCount: 1,
    };
  });
}

const requestedTimeframes: string[] = [];

function buildRoutes(): readonly FakeRoute[] {
  return [
    { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
    {
      method: 'GET',
      path: '/v1/markets/candles',
      respond: (call): Response => {
        const timeframe = call.query.get('timeframe') ?? '';
        requestedTimeframes.push(`${call.query.get('symbol') ?? ''}|${timeframe}`);
        const count = timeframe === '1m' ? MINUTE_CANDLE_COUNT : 100;
        return dataResponse(candlesOf({ timeframe, count }));
      },
    },
  ];
}

async function showCardWithLivePrice(
  marketDisplayTimeframes: readonly string[],
): Promise<HTMLElement> {
  const { stream } = renderApp({
    path: '/',
    isAuthenticated: true,
    routes: buildRoutes(),
    marketDisplayTimeframes,
  });
  const card = await screen.findByRole('article', { name: 'BTC/USDT' });
  await waitFor(() => expect(stream.connections()).toBe(1));
  act(() => stream.setStatus('live'));
  act(() =>
    stream.tick({
      symbol: 'BTCUSDT',
      price: '105',
      change24h: '1',
      at: Date.now(),
      isStale: false,
    }),
  );
  return card;
}

describe('price variation fallback on stored 1 min candles', () => {
  test('1, 5 and 15 min come from the 1 min candles when 1m is a stored display timeframe', async () => {
    requestedTimeframes.length = 0;
    const card = await showCardWithLivePrice(['1m', '3m']);
    await waitFor(() =>
      expect(within(card).getByLabelText('subiu 5,00% em 1 minuto')).toBeTruthy(),
    );
    expect(within(card).getByLabelText('subiu 5,00% em 5 minutos')).toBeTruthy();
    expect(within(card).getByLabelText('subiu 5,00% em 15 minutos')).toBeTruthy();
    // Uma consulta de 1 min por par, partilhada pela chave.
    expect(requestedTimeframes.filter((entry) => entry.endsWith('|1m')).sort()).toEqual([
      'BTCUSDT|1m',
      'ETHUSDT|1m',
    ]);
  });

  test('without 1m in the environment it never asks for 1 min candles and keeps the empty windows', async () => {
    requestedTimeframes.length = 0;
    const card = await showCardWithLivePrice(['3m']);
    await waitFor(() => expect(within(card).getByLabelText('subiu 5,00% em 1 hora')).toBeTruthy());
    expect(within(card).getByLabelText(/^Variação em 1 minuto indisponível/)).toBeTruthy();
    expect(requestedTimeframes.some((entry) => entry.endsWith('|1m'))).toBe(false);
  });
});
