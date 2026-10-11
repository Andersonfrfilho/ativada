// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, screen, waitFor, within } from '@testing-library/react';

import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');
const HOUR = 3_600_000;

function candles(base: number): Record<string, unknown>[] {
  return Array.from({ length: 30 }, (_, index) => {
    const openTime = NOW - (30 - index) * HOUR;
    const close = String(base + index);
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
  });
}

const ROUTES: readonly FakeRoute[] = [
  { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
  {
    method: 'GET',
    path: '/v1/market/sentiment',
    respond: (): Response =>
      dataResponse({
        fearGreed: 27,
        classification: 'Fear',
        date: '2026-10-11',
        source: {
          name: 'alternative.me',
          creditText: 'Fear & Greed Index por alternative.me',
          url: 'https://alternative.me/crypto/fear-and-greed-index/',
        },
      }),
  },
  {
    method: 'GET',
    path: '/v1/markets/candles',
    respond: (call): Response =>
      dataResponse(candles(call.query.get('symbol') === 'BTCUSDT' ? 60_000 : 3_000)),
  },
];

function tick(
  symbol: string,
  price: string,
  extra: Record<string, unknown> = {},
): {
  symbol: string;
  price: string;
  change24h: string | null;
  at: number;
  isStale: boolean;
} {
  return { symbol, price, change24h: '2.5', at: NOW, isStale: false, ...extra };
}

async function openOverview(): Promise<ReturnType<typeof renderApp>> {
  const rendered = renderApp({ path: '/', isAuthenticated: true, routes: ROUTES });
  await screen.findByRole('article', { name: 'BTC/USDT' });
  await waitFor(() => expect(rendered.stream.connections()).toBe(1));
  return rendered;
}

describe('live prices on the overview', () => {
  test('a tick replaces the price and the 24 h change at once, without asking the API again', async () => {
    const { fake, stream } = await openOverview();
    const bitcoin = screen.getByRole('article', { name: 'BTC/USDT' });
    await waitFor(() => expect(bitcoin.textContent).toContain('60.029,00'));
    const requests = fake.callsTo('GET', '/v1/markets/candles').length;
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    await waitFor(() => expect(bitcoin.textContent).toContain('62.000,50'));
    expect(bitcoin.textContent).toContain('+2,50%');
    expect(fake.callsTo('GET', '/v1/markets/candles').length).toBe(requests);
  });

  test('says "ao vivo" while ticks arrive, and "sem dados há N s" when the server seals them as stale', async () => {
    const { stream } = await openOverview();
    act(() => stream.setStatus('live'));
    expect(await screen.findByText('Aguardando preços')).toBeDefined();
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    expect(await screen.findByText('Preços ao vivo')).toBeDefined();
    act(() => stream.tick(tick('BTCUSDT', '62000.50', { isStale: true })));
    expect((await screen.findByText(/Sem dados há \d+ s/)).textContent).toContain('Sem dados');
  });

  test('with the socket down it says "sem dados" and falls back to REST polling every 15 s (shortened here)', async () => {
    const { fake, stream } = await openOverview();
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    await screen.findByText('Preços ao vivo');
    const before = fake.callsTo('GET', '/v1/markets/candles').length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(fake.callsTo('GET', '/v1/markets/candles').length).toBe(before);
    act(() => stream.setStatus('reconnecting'));
    expect(await screen.findByText(/Sem dados há \d+ s/)).toBeDefined();
    await waitFor(() =>
      expect(fake.callsTo('GET', '/v1/markets/candles').length).toBeGreaterThan(before + 1),
    );
    const bitcoin = screen.getByRole('article', { name: 'BTC/USDT' });
    expect(bitcoin.textContent).toContain('60.029,00');
  });

  test('coming back refetches over REST and the next tick corrects the screen', async () => {
    const { fake, stream } = await openOverview();
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    act(() => stream.setStatus('reconnecting'));
    await screen.findByText(/Sem dados há \d+ s/);
    const before = fake.callsTo('GET', '/v1/markets/candles').length;
    act(() => {
      stream.setStatus('live');
      stream.resync('reconnected');
    });
    await waitFor(() =>
      expect(fake.callsTo('GET', '/v1/markets/candles').length).toBeGreaterThan(before),
    );
    act(() => stream.tick(tick('BTCUSDT', '63000.00')));
    const bitcoin = screen.getByRole('article', { name: 'BTC/USDT' });
    await waitFor(() => expect(bitcoin.textContent).toContain('63.000,00'));
    expect(await screen.findByText('Preços ao vivo')).toBeDefined();
  });

  test('shows the Fear & Greed value with the classification, date and the credit link', async () => {
    await openOverview();
    const card = await screen.findByRole('region', { name: 'Sentimento do mercado' });
    expect(card.textContent).toContain('27');
    expect(card.textContent).toContain('Medo');
    expect(card.textContent).toContain('11/10/2026');
    const link = within(card).getByRole('link', { name: 'Fear & Greed Index por alternative.me' });
    expect(link.getAttribute('href')).toBe('https://alternative.me/crypto/fear-and-greed-index/');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });
});
