// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, screen, waitFor, within } from '@testing-library/react';

import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

const MINUTE = 60_000;

function fifteenMinuteCandles(): Record<string, unknown>[] {
  const now = Date.now();
  return Array.from({ length: 100 }, (_, index) => {
    const closeTime = now - 5 * MINUTE - (99 - index) * 15 * MINUTE;
    return {
      openTime: closeTime - 15 * MINUTE + 1,
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

const ROUTES: readonly FakeRoute[] = [
  { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse([]) },
  {
    method: 'GET',
    path: '/v1/markets/candles',
    respond: (): Response => dataResponse(fifteenMinuteCandles()),
  },
];

describe('price variation on the coin card', () => {
  test('shows each window with arrow, sign and words; a window without data says why instead of zero', async () => {
    const { stream } = renderApp({ path: '/', isAuthenticated: true, routes: ROUTES });
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
    const list = card;
    await waitFor(() => expect(within(list).getByLabelText('subiu 5,00% em 1 hora')).toBeTruthy());
    expect(within(list).getByLabelText('subiu 5,00% em 24 horas').textContent).toContain('+5,00%');
    const oneMinute = within(list).getByLabelText(/^Variação em 1 minuto indisponível/);
    expect(oneMinute.textContent).not.toContain('NaN');
    expect(oneMinute.textContent).not.toContain('0,00');
  });
});
