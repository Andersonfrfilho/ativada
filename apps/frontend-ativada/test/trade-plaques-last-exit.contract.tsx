// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, screen, waitFor } from '@testing-library/react';

import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { TradePlaques } from '../src/runs/team-room/balcony/TradePlaques.component.js';
import { buildRun } from './support/run-fixtures.js';
import {
  dataResponse,
  pageResponse,
  type FakeRoute,
  type RecordedCall,
} from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

afterEach(cleanup);

const START = Date.UTC(2026, 0, 1);

function closedTrade(index: number, exitPrice: string): Record<string, unknown> {
  return {
    engineKey: `t${index}`,
    status: 'closed',
    entryPrice: '100',
    quantity: '1',
    exitPrice,
    netProfit: '1',
    netProfitRate: '0.01',
    exitReason: 'target',
    openedCandleTime: START + index * 3_600_000,
    closedCandleTime: START + index * 3_600_000 + 1_800_000,
    entryNotional: '100',
    exitNotional: exitPrice,
    paid: '100',
    received: exitPrice,
    fees: '0',
  };
}

// Como o servidor: ordem de abertura crescente, e `order=desc` começa pela mais recente.
function tradesRoute(): FakeRoute {
  const all = [closedTrade(0, '111'), closedTrade(1, '222'), closedTrade(2, '333')];
  return {
    method: 'GET',
    path: '/v1/runs/run-1/trades',
    respond: (call: RecordedCall): Response => {
      const isOpenRequest = call.query.get('status') === 'open';
      const ordered = call.query.get('order') === 'desc' ? [...all].reverse() : all;
      return pageResponse(isOpenRequest ? [] : ordered);
    },
  };
}

describe('plaquinha da última saída', () => {
  test('shows the most recent closed trade, not the first one the server lists', async () => {
    const rendered = renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/runs/run-1',
          respond: (): Response => dataResponse(buildRun({ id: 'run-1' })),
        },
        tradesRoute(),
      ],
      probe: (
        <LiveMarketProvider>
          <TradePlaques runId="run-1" />
        </LiveMarketProvider>
      ),
    });
    const section = await screen.findByRole('region', { name: /./ });
    await waitFor(() => expect(section.textContent).toContain('333'));
    expect(section.textContent).not.toContain('111');
    const closedRequest = rendered.fake
      .callsTo('GET', '/v1/runs/run-1/trades')
      .find((call) => call.query.get('status') === 'closed');
    expect(closedRequest?.query.get('order')).toBe('desc');
  });
});
