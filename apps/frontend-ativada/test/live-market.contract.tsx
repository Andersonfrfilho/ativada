// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, screen, waitFor, within } from '@testing-library/react';

import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
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

function bitcoinCandleCalls(fake: ReturnType<typeof renderApp>['fake']): number {
  return fake
    .callsTo('GET', '/v1/markets/candles')
    .filter((call) => call.query.get('symbol') === 'BTCUSDT').length;
}

async function openOverview(): Promise<ReturnType<typeof renderApp>> {
  const rendered = renderApp({ path: '/', isAuthenticated: true, routes: ROUTES });
  await screen.findByRole('article', { name: 'BTC/USDT' });
  await waitFor(() => expect(rendered.stream.connections()).toBe(1));
  return rendered;
}

describe('the price badge for screen readers', () => {
  function stateRegion(): HTMLElement {
    const region = screen
      .getAllByRole('status')
      .find((element) => (element.textContent ?? '').startsWith('Estado dos preços'));
    if (region === undefined) throw new Error('região de estado dos preços ausente');
    return region;
  }

  test('only the state change is announced: the live region never carries the ticking seconds', async () => {
    const { stream } = await openOverview();
    expect(stateRegion().textContent).toBe('Estado dos preços: sem dados');
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    await waitFor(() => expect(stateRegion().textContent).toBe('Estado dos preços: ao vivo'));
    act(() => stream.setStatus('reconnecting'));
    await waitFor(() => expect(stateRegion().textContent).toBe('Estado dos preços: sem dados'));
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(stateRegion().textContent).toBe('Estado dos preços: sem dados');
    expect(screen.getByText(/^Sem dados há \d+ s$/).getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the sentiment card without data', () => {
  test('404 says it was not collected yet; a server error says it could not be read', async () => {
    const failing = (status: number, code: string): readonly FakeRoute[] =>
      ROUTES.map((route) =>
        route.path === '/v1/market/sentiment'
          ? { ...route, respond: (): Response => errorResponse(status, code) }
          : route,
      );
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: failing(404, 'SENTIMENT_NOT_AVAILABLE'),
    });
    expect(await screen.findByText('O índice ainda não foi coletado.')).toBeDefined();
  });

  test('a 500 says the index could not be read now', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: ROUTES.map((route) =>
        route.path === '/v1/market/sentiment'
          ? { ...route, respond: (): Response => errorResponse(500, 'BOOM') }
          : route,
      ),
    });
    expect(await screen.findByText('Não foi possível ler o índice agora.')).toBeDefined();
  });
});

describe('the sentiment credit link', () => {
  function withSentiment(url: string): readonly FakeRoute[] {
    return ROUTES.map((route) =>
      route.path === '/v1/market/sentiment'
        ? {
            ...route,
            respond: (): Response =>
              dataResponse({
                fearGreed: 27,
                classification: 'Fear',
                date: '2026-10-11',
                source: {
                  name: 'alternative.me',
                  creditText: 'Fear & Greed Index por alternative.me',
                  url,
                },
              }),
          }
        : route,
    );
  }

  for (const url of ['javascript:alert(1)', 'http://alternative.me/x', 'not a url']) {
    test(`${url} from the API is never put in an href: the fixed credit link stays`, async () => {
      renderApp({ path: '/', isAuthenticated: true, routes: withSentiment(url) });
      const link = await screen.findByRole('link', {
        name: 'Fear & Greed Index por alternative.me',
      });
      expect(link.getAttribute('href')).toBe('https://alternative.me/crypto/fear-and-greed-index/');
    });
  }
});

describe('a quiet pair', () => {
  test('leaves live mode on its own card while the other pair keeps ticking, and polls REST for it only', async () => {
    const rendered = renderApp({
      path: '/',
      isAuthenticated: true,
      routes: ROUTES,
      silenceMilliseconds: 300,
    });
    const { fake, stream } = rendered;
    await screen.findByRole('article', { name: 'BTC/USDT' });
    await waitFor(() => expect(stream.connections()).toBe(1));
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    act(() => stream.tick(tick('ETHUSDT', '3100.00')));
    const bitcoin = screen.getByRole('article', { name: 'BTC/USDT' });
    const ether = screen.getByRole('article', { name: 'ETH/USDT' });
    await waitFor(() => expect(bitcoin.textContent).toContain('62.000,50'));
    const bitcoinCalls = (): number =>
      fake.callsTo('GET', '/v1/markets/candles').filter((c) => c.query.get('symbol') === 'BTCUSDT')
        .length;
    const etherCalls = (): number =>
      fake.callsTo('GET', '/v1/markets/candles').filter((c) => c.query.get('symbol') === 'ETHUSDT')
        .length;
    const bitcoinBefore = bitcoinCalls();
    for (let index = 0; index < 8; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      act(() => stream.tick(tick('ETHUSDT', `31${index}0.00`)));
    }
    await waitFor(() => expect(bitcoin.textContent).toMatch(/Sem dados há \d+ s/));
    expect(bitcoin.textContent).not.toContain('62.000,50');
    expect(bitcoin.textContent).toContain('60.029,00');
    expect(ether.textContent).toMatch(/Ao vivo · há \d+ s/);
    await waitFor(() => expect(bitcoinCalls()).toBeGreaterThan(bitcoinBefore + 1));
    const etherBefore = etherCalls();
    await new Promise((resolve) => setTimeout(resolve, 100));
    act(() => stream.tick(tick('ETHUSDT', '3200.00')));
    expect(etherCalls()).toBe(etherBefore);
  });
});

describe('live prices on the overview', () => {
  test('a tick replaces the price and the 24 h change at once, without asking the API again', async () => {
    const { fake, stream } = await openOverview();
    const bitcoin = screen.getByRole('article', { name: 'BTC/USDT' });
    await waitFor(() => expect(bitcoin.textContent).toContain('60.029,00'));
    const requests = bitcoinCandleCalls(fake);
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    await waitFor(() => expect(bitcoin.textContent).toContain('62.000,50'));
    expect(bitcoin.textContent).toContain('+2,50%');
    expect(bitcoinCandleCalls(fake)).toBe(requests);
  });

  test('with a live USDT/BRL rate the price shows its value in reais in a tooltip', async () => {
    const { stream } = await openOverview();
    const bitcoin = screen.getByRole('article', { name: 'BTC/USDT' });
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    await waitFor(() => expect(bitcoin.textContent).toContain('62.000,50'));
    expect(within(bitcoin).queryByRole('tooltip')).toBeNull();
    act(() => stream.tick(tick('USDTBRL', '5.5')));
    const tooltip = await within(bitcoin).findByRole('tooltip');
    expect(tooltip.textContent).toBe('≈ R$ 341.002,75');
    expect(within(bitcoin).getByText('62.000,50').getAttribute('aria-describedby')).toBe(
      tooltip.id,
    );
  });

  test('says "ao vivo" while ticks arrive, and "sem dados há N s" when the server seals them as stale', async () => {
    const { stream } = await openOverview();
    act(() => stream.setStatus('live'));
    expect(await screen.findByText('Aguardando preços')).toBeDefined();
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    expect(await screen.findByText('Preços ao vivo')).toBeDefined();
    act(() => stream.tick(tick('BTCUSDT', '62000.50', { isStale: true })));
    expect((await screen.findByText(/^Sem dados há \d+ s$/)).textContent).toContain('Sem dados');
  });

  test('with the socket down it says "sem dados" and falls back to REST polling every 15 s (shortened here)', async () => {
    const { fake, stream } = await openOverview();
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    await screen.findByText('Preços ao vivo');
    const before = bitcoinCandleCalls(fake);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(bitcoinCandleCalls(fake)).toBe(before);
    act(() => stream.setStatus('reconnecting'));
    expect(await screen.findByText(/^Sem dados há \d+ s$/)).toBeDefined();
    await waitFor(() => expect(bitcoinCandleCalls(fake)).toBeGreaterThan(before + 1));
    const bitcoin = screen.getByRole('article', { name: 'BTC/USDT' });
    expect(bitcoin.textContent).toContain('60.029,00');
  });

  test('coming back refetches over REST and the next tick corrects the screen', async () => {
    const { fake, stream } = await openOverview();
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('BTCUSDT', '62000.50')));
    act(() => stream.setStatus('reconnecting'));
    await screen.findByText(/^Sem dados há \d+ s$/);
    const before = bitcoinCandleCalls(fake);
    act(() => {
      stream.setStatus('live');
      stream.resync('reconnected');
    });
    await waitFor(() => expect(bitcoinCandleCalls(fake)).toBeGreaterThan(before));
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
