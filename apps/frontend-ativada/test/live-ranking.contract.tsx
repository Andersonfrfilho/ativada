// Copyright (c) 2026 Ada Technology. All rights reserved.
import { beforeEach, describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { liveSummaryItemSchema } from '../src/overview/live-summary.validation.js';
import { runSchema } from '../src/runs/run.validation.js';
import { buildRanking } from '../src/backtests/live-ranking/live-ranking.js';
import {
  dataResponse,
  pageResponse,
  type FakeRoute,
  type RecordedCall,
} from './support/fake-fetch.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import { buildRun, buildStrategy, buildVersion } from './support/run-fixtures.js';

function live(
  id: string,
  symbol: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return buildRun({
    id,
    kind: 'live_paper',
    status: 'running',
    symbol,
    periodEnd: null,
    metrics: null,
    ...extra,
  });
}

const RUNS = [
  live('btc-1h', 'BTCUSDT', { timeframe: '1h' }),
  live('btc-4h', 'BTCUSDT', { timeframe: '4h' }),
  live('eth', 'ETHUSDT'),
  live('sol', 'SOLUSDT', { signalSource: { kind: 'model_team', team: 'olivia' } }),
  live('bnb', 'BNBUSDT'),
  live('xrp', 'XRPUSDT'),
  live('stopped', 'ADAUSDT', { status: 'completed' }),
];

const RATES: Record<string, string> = {
  'btc-1h': '0.0326',
  'btc-4h': '-0.011',
  eth: '0.05',
  sol: '0.0100',
  bnb: '0',
  xrp: '0.0001',
  stopped: '0.9',
};

function summaryItem(runId: string, resultRate: string): Record<string, unknown> {
  return {
    runId,
    strategyName: 'Placar',
    analystMode: null,
    initialBalance: '1000.00',
    balance: '1000.00',
    result: '0.00',
    resultRate,
    buyAndHold: null,
    buyCount: 0,
    sellCount: 0,
    lastDecisionAt: null,
    isWaitingForData: false,
  };
}

function routes(): readonly FakeRoute[] {
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
    {
      method: 'GET',
      path: '/v1/runs',
      respond: (call: RecordedCall): Response =>
        pageResponse(call.query.get('kind') === 'live_paper' ? RUNS : []),
    },
    {
      method: 'GET',
      path: '/v1/runs/live-summary',
      respond: (): Response =>
        dataResponse({ items: Object.entries(RATES).map(([id, rate]) => summaryItem(id, rate)) }),
    },
    ...RUNS.map((run): FakeRoute => ({
      method: 'GET',
      path: `/v1/runs/${String(run['id'])}`,
      respond: (): Response => dataResponse(run),
    })),
  ];
}

async function openRoom(path: string): Promise<RenderedApp> {
  const app = renderApp({ path, isAuthenticated: true, routes: routes() });
  await screen.findByRole('region', { name: 'Ranking ao vivo' });
  return app;
}

function chips(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Ranking ao vivo' })).getAllByRole('link');
}

beforeEach(() => {
  localStorage.clear();
});

describe('ranking ao vivo', () => {
  test('ranks running simulations by result with position, word and no extra request', async () => {
    const app = await openRoom('/backtests/eth');
    const texts = chips().map((chip) => chip.textContent ?? '');
    expect(texts).toHaveLength(6);
    expect(texts[0]).toContain('1º');
    expect(texts[0]).toContain('ETH/USDT');
    expect(texts[0]).toContain('+5,00%');
    expect(texts[0]).toContain('no lucro');
    expect(texts[1]).toContain('BTC/USDT · 1h');
    expect(texts[2]).toContain('SOL/USDT ◆ Olívia');
    expect(texts[3]).toContain('4º');
    expect(texts[3]).toContain('+0,01%');
    expect(texts[4]).toContain('= 0,00%');
    expect(texts[5]).toContain('−1,10%');
    expect(texts[5]).toContain('no prejuízo');
    expect(texts[5]).toContain('BTC/USDT · 4h');
    expect(app.fake.callsTo('GET', '/v1/runs/live-summary')).toHaveLength(1);
    const listings = app.fake
      .callsTo('GET', '/v1/runs')
      .filter(
        (call) => call.query.get('kind') === 'live_paper' && call.query.get('symbol') === null,
      );
    // Só as duas listas que a página já pedia (a do trocador e a do painel): o ranking não abre uma terceira.
    expect(new Set(listings.map((call) => call.query.get('limit'))).size).toBeLessThanOrEqual(2);
  });

  test('top three in profit wear gold, silver and bronze medals with the word', async () => {
    await openRoom('/backtests/eth');
    const texts = chips().map((chip) => chip.textContent ?? '');
    expect(texts[0]).toContain('ouro');
    expect(texts[1]).toContain('prata');
    expect(texts[2]).toContain('bronze');
    expect(texts[3]).not.toMatch(/ouro|prata|bronze/);
  });

  test('marks the current run with aria-current and navigates on click', async () => {
    await openRoom('/backtests/eth');
    const current = chips().filter((chip) => chip.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain('ETH/USDT');
    const target = chips()[1];
    expect(target?.getAttribute('href')).toBe('/backtests/btc-1h');
    if (target !== undefined) fireEvent.click(target);
    await waitFor(() =>
      expect(
        chips().find((chip) => chip.getAttribute('aria-current') === 'true')?.textContent,
      ).toContain('BTC/USDT · 1h'),
    );
  });
});

describe('buildRanking', () => {
  test('skips stopped runs and runs without a summary', () => {
    const run = (id: string, status: string): ReturnType<typeof runSchema.parse> =>
      runSchema.parse(buildRun({ id, status, kind: 'live_paper' }));
    const entries = buildRanking(
      [run('a', 'running'), run('b', 'completed'), run('c', 'running')],
      [
        liveSummaryItemSchema.parse(summaryItem('a', '0.1')),
        liveSummaryItemSchema.parse(summaryItem('b', '0.5')),
      ],
      'a',
    );
    expect(entries.map((entry) => entry.runId)).toEqual(['a']);
  });
});
