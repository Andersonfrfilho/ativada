// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, screen, waitFor } from '@testing-library/react';

import { STREAM_STATUS } from '../src/live/stream.constant.js';
import {
  liveStatusSchema,
  type LiveStatus,
} from '../src/runs/live-tracking/live-status.validation.js';
import { buildStrategyLevels, LEVELS_NOTICE } from '../src/runs/candle-chart/strategy-levels.js';
import type { FakeChartSurface } from './support/fake-chart-surface.js';
import { dataResponse } from './support/fake-fetch.js';
import { showCandleCard } from './support/candle-card-harness.js';
import { buildLiveStatusResponse } from './support/live-status-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const OPEN_POSITION = {
  entryPrice: '12.45',
  quantity: '1',
  targetPrice: '12.90',
  stopPrice: '12.10',
  openedCandleTime: 1,
};

const PRICE_RULE = {
  ruleId: 'bb',
  label: 'Bollinger 20/2',
  kind: 'bollinger',
  vote: 0,
  weight: '1',
  isMet: false,
  metric: 'close_price',
  direction: 'above',
  basis: 'indicative',
  current: '12.44',
  threshold: '12.53',
  distance: '0.09',
  distanceRate: null,
  message: 'Bollinger 20/2: o preço precisa fechar acima de 12,53.',
};

function awaiting(rules: readonly unknown[]): Record<string, unknown> {
  return {
    status: 'available',
    state: 'awaiting_entry',
    score: '1',
    scoreThreshold: '2',
    scoreGap: '1',
    message: 'Faltam 1 ponto de 2 para comprar.',
    rules,
  };
}

function statusWith(overrides: Record<string, unknown>): LiveStatus {
  return liveStatusSchema.parse(buildLiveStatusResponse(overrides));
}

describe('níveis da estratégia nesta simulação', () => {
  test('with an open position: entry, target and stop, in words with the server values', () => {
    const levels = buildStrategyLevels(statusWith({ openPosition: OPEN_POSITION }));
    expect(levels.map((level) => [level.role, level.title, level.price])).toEqual([
      ['entry', 'Entrada 12,45', 12.45],
      ['target', 'Alvo 12,90', 12.9],
      ['stop', 'Stop 12,10', 12.1],
    ]);
  });

  test('without a position: only the price rule that has not voted yet, never above 3 lines', () => {
    const levels = buildStrategyLevels(statusWith({ triggers: awaiting([PRICE_RULE]) }));
    expect(levels).toHaveLength(1);
    expect(levels[0]?.title).toBe('Bollinger 20/2 vota a favor se fechar acima de 12,53');
    expect(buildStrategyLevels(statusWith({ triggers: awaiting([]) }))).toEqual([]);
    const met = { ...PRICE_RULE, isMet: true };
    expect(buildStrategyLevels(statusWith({ triggers: awaiting([met]) }))).toEqual([]);
  });

  test('the notice never calls the levels a price target or a recommendation', () => {
    expect(LEVELS_NOTICE).toContain('Não são previsão de preço nem recomendação');
    expect(LEVELS_NOTICE).toContain('Tendência, não promessa');
  });
});

describe('camada "Níveis" no gráfico', () => {
  function respondWith(overrides: Record<string, unknown>): {
    readonly extraRoutes: readonly { method: 'GET'; path: string; respond: () => Response }[];
  } {
    return {
      extraRoutes: [
        {
          method: 'GET',
          path: '/v1/runs/run-1/live-status',
          respond: (): Response => dataResponse(buildLiveStatusResponse(overrides)),
        },
      ],
    };
  }

  async function open(overrides: Record<string, unknown>): Promise<FakeChartSurface> {
    const harness = showCandleCard({ kind: 'live_paper', ...respondWith(overrides) });
    act(() => harness.app.stream.setStatus(STREAM_STATUS.LIVE));
    await screen.findByRole('img', { name: 'Gráfico de velas de BNB/USDT' });
    await waitFor(() =>
      expect(harness.surfaces.find((s) => !s.isDestroyed())?.callsOf('setCandles').length).toBe(1),
    );
    const surface = harness.surfaces.find((candidate) => !candidate.isDestroyed());
    if (surface === undefined) throw new Error('nenhuma superfície viva');
    return surface;
  }

  test('the lines reach the surface and the notice names them as strategy levels', async () => {
    const surface = await open({ openPosition: OPEN_POSITION });
    await waitFor(() => expect(surface.callsOf('setPriceLevels').at(-1)?.[0]).toHaveLength(3));
    expect(await screen.findByText(LEVELS_NOTICE)).toBeDefined();
    expect(screen.getByRole('button', { name: /Níveis/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  test('turning the layer off clears the lines and the notice', async () => {
    const surface = await open({ openPosition: OPEN_POSITION });
    await waitFor(() => expect(surface.callsOf('setPriceLevels').at(-1)?.[0]).toHaveLength(3));
    act(() => screen.getByRole('button', { name: /Níveis/ }).click());
    await waitFor(() => expect(surface.callsOf('setPriceLevels').at(-1)?.[0]).toHaveLength(0));
    expect(screen.queryByText(LEVELS_NOTICE)).toBeNull();
  });
});
