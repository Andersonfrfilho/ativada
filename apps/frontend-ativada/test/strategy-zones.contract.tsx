// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, screen, waitFor } from '@testing-library/react';

import { STREAM_STATUS } from '../src/live/stream.constant.js';
import {
  liveStatusSchema,
  type LiveStatus,
} from '../src/runs/live-tracking/live-status.validation.js';
import {
  buildStrategyZones,
  ZONES_LEAD,
  ZONES_WAITING,
} from '../src/runs/candle-chart/strategy-zones.js';
import type { FakeChartSurface } from './support/fake-chart-surface.js';
import { dataResponse } from './support/fake-fetch.js';
import { showCandleCard } from './support/candle-card-harness.js';
import { buildLiveStatusResponse } from './support/live-status-fixtures.js';
import { buildRoomDecision } from './support/team-room-fixtures.js';

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

function decisionsWithClose(close: string): Record<string, unknown> {
  return { items: [{ ...buildRoomDecision(), close }], nextCursor: null };
}

function statusWith(overrides: Record<string, unknown>): LiveStatus {
  return liveStatusSchema.parse(buildLiveStatusResponse(overrides));
}

describe('faixas da estratégia nesta simulação', () => {
  test('holding: a sell zone from the entry to the target and a protection zone from the stop to the entry', () => {
    const { zones, reason } = buildStrategyZones(statusWith({ openPosition: OPEN_POSITION }));
    expect(reason).toBeUndefined();
    expect(zones.map((zone) => [zone.kind, zone.low, zone.high, zone.label])).toEqual([
      ['sell', 12.45, 12.9, 'Faixa de venda: 12,45–12,90'],
      ['protection', 12.1, 12.45, 'Proteção: se cair abaixo de 12,10 vende'],
    ]);
  });

  test('without a position: the buy zone runs from the last close to the price the rule asks for', () => {
    const status = statusWith({
      triggers: awaiting([PRICE_RULE]),
      decisions: decisionsWithClose('12.44'),
    });
    const [zone] = buildStrategyZones(status).zones;
    expect([zone?.kind, zone?.low, zone?.high]).toEqual(['buy', 12.44, 12.53]);
    expect(zone?.label).toBe('Faixa de compra da estratégia 12,44–12,53');
  });

  test('with several price rules the buy zone covers every trigger', () => {
    const other = { ...PRICE_RULE, ruleId: 'dc', threshold: '12.60' };
    const status = statusWith({
      triggers: awaiting([PRICE_RULE, other]),
      decisions: decisionsWithClose('12.44'),
    });
    expect(buildStrategyZones(status).zones[0]?.label).toBe(
      'Faixa de compra da estratégia 12,44–12,60',
    );
  });

  test('without reading from the server no zone is drawn and the reason says so', () => {
    const none = buildStrategyZones(statusWith({ triggers: awaiting([]) }));
    expect(none.zones).toEqual([]);
    expect(none.reason).toBe(ZONES_WAITING);
    const met = { ...PRICE_RULE, isMet: true };
    const status = statusWith({
      triggers: awaiting([met]),
      decisions: decisionsWithClose('12.44'),
    });
    expect(buildStrategyZones(status).zones).toEqual([]);
  });

  test('the notice says it is the rule of the simulation, not a recommendation to operate', () => {
    expect(ZONES_LEAD).toContain('não é recomendação para você operar');
  });
});

describe('faixas na superfície do gráfico', () => {
  async function open(overrides: Record<string, unknown>): Promise<FakeChartSurface> {
    const harness = showCandleCard({
      kind: 'live_paper',
      extraRoutes: [
        {
          method: 'GET',
          path: '/v1/runs/run-1/live-status',
          respond: (): Response => dataResponse(buildLiveStatusResponse(overrides)),
        },
      ],
    });
    act(() => harness.app.stream.setStatus(STREAM_STATUS.LIVE));
    await screen.findByRole('img', { name: 'Gráfico de velas de BNB/USDT' });
    await waitFor(() =>
      expect(harness.surfaces.find((s) => !s.isDestroyed())?.callsOf('setCandles').length).toBe(1),
    );
    const surface = harness.surfaces.find((candidate) => !candidate.isDestroyed());
    if (surface === undefined) throw new Error('nenhuma superfície viva');
    return surface;
  }

  test('the zones reach the surface with the right prices and the notice names the rule of the simulation', async () => {
    const surface = await open({ openPosition: OPEN_POSITION });
    await waitFor(() => expect(surface.callsOf('setZones').at(-1)?.[0]).toHaveLength(2));
    expect(await screen.findByText(new RegExp(ZONES_LEAD))).toBeDefined();
  });

  test('with no reading the surface gets no zone and the screen says why', async () => {
    const surface = await open({ triggers: awaiting([]) });
    await waitFor(() => expect(screen.getByText(ZONES_WAITING)).toBeDefined());
    expect(surface.callsOf('setZones').at(-1)?.[0]).toEqual([]);
  });
});
