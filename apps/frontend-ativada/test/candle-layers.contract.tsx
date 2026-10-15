// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { readChartPreferences } from '../src/runs/candle-chart/chart-preferences.js';
import { buildFixtureChart, fillTime, FIXTURE_DAY } from './fixtures/trade-chart.fixture.js';
import type { FakeChartSurface } from './support/fake-chart-surface.js';
import { dataResponse, errorResponse, type RecordedCall } from './support/fake-fetch.js';
import {
  FIXTURE_FROM,
  FIXTURE_HOUR,
  showCandleCard,
  type CandleCardHarness,
  type CandleCardOptions,
} from './support/candle-card-harness.js';
import { buildProjectionsResponse } from './support/candle-chart-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const EXTENT_END = FIXTURE_FROM + 40 * FIXTURE_DAY;

function layersFor(
  call: RecordedCall,
  lines: readonly unknown[] | undefined = undefined,
): Response {
  const from = Number(call.query.get('from'));
  const to = Number(call.query.get('to'));
  const candleTimes: number[] = [];
  for (let time = from; time < to; time += FIXTURE_HOUR) candleTimes.push(time);
  const score = candleTimes.map((time) => String(((time / FIXTURE_HOUR) % 5) - 2));
  return dataResponse({
    version: 'layers-1',
    timeframe: '1h',
    from,
    to,
    candleTimes,
    score,
    actions: score.map((value) => (value === '2' ? 'BUY' : value === '-2' ? 'SELL' : 'HOLD')),
    atr: candleTimes.map(() => '0.50000000'),
    lines: lines ?? [
      {
        key: 'rule:donchian.upper',
        ruleId: 'donchian',
        role: 'channel_upper',
        label: 'Canal Donchian (20 velas): topo',
        values: candleTimes.map((time) => String(610 + ((time / FIXTURE_HOUR) % 7))),
      },
    ],
    thresholds: [{ from: FIXTURE_FROM, to: EXTENT_END, buy: '2', sell: '-2' }],
  });
}

function show(options: CandleCardOptions = {}): CandleCardHarness {
  return showCandleCard({ respondLayers: (call) => layersFor(call), ...options });
}

function alive(harness: CandleCardHarness): FakeChartSurface {
  const surface = harness.surfaces.find((candidate) => !candidate.isDestroyed());
  if (surface === undefined) throw new Error('nenhuma superfície viva');
  return surface;
}

async function ready(harness: CandleCardHarness): Promise<FakeChartSurface> {
  await waitFor(() =>
    expect(
      harness.surfaces.find((candidate) => !candidate.isDestroyed())?.callsOf('setCandles').length,
    ).toBeGreaterThan(0),
  );
  return alive(harness);
}

function list(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('lista esperada');
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new Error('objeto esperado');
    return Object.fromEntries(Object.entries(item));
  });
}

function pressed(name: string): string | null {
  return screen.getByRole('button', { name }).getAttribute('aria-pressed');
}

describe('camadas da estratégia: linhas e placar', () => {
  test('asks the layers of the visible window (at most 1,000 candles, inside the run) and draws lines and score', async () => {
    const harness = show();
    const surface = await ready(harness);
    await waitFor(() =>
      expect(list(surface.callsOf('setScore').at(-1)?.[0]).length).toBeGreaterThan(0),
    );
    const call = harness.layersCalls()[0];
    const from = Number(call?.query.get('from'));
    const to = Number(call?.query.get('to'));
    expect(from).toBeGreaterThanOrEqual(FIXTURE_FROM);
    expect(to).toBeLessThanOrEqual(EXTENT_END);
    expect((to - from) / FIXTURE_HOUR).toBeLessThanOrEqual(1_000);
    expect(from).toBeLessThanOrEqual(EXTENT_END - FIXTURE_HOUR);
    expect(to).toBe(EXTENT_END);
    const lines = list(surface.callsOf('setLines').at(-1)?.[0]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: 'rule:donchian.upper', role: 'channel_upper' });
    expect(list(lines[0]?.['points'])).toHaveLength((to - from) / FIXTURE_HOUR);
    const [bars, thresholds] = surface.callsOf('setScore').at(-1) ?? [];
    expect(list(bars)).toHaveLength((to - from) / FIXTURE_HOUR);
    expect(list(thresholds)).toStrictEqual([
      { from: FIXTURE_FROM / 1_000, to: EXTENT_END / 1_000, buy: 2, sell: -2 },
    ]);
  });

  test('names each line and the score panel in words', async () => {
    const harness = show();
    await ready(harness);
    expect(await screen.findByText('Canal Donchian (20 velas): topo')).toBeDefined();
    expect(
      await screen.findByText('Placar da estratégia — compra em +2, venda em −2'),
    ).toBeDefined();
  });

  test('a strategy without price rules says so instead of drawing nothing silently', async () => {
    const harness = show({ respondLayers: (call) => layersFor(call, []) });
    await ready(harness);
    expect(await screen.findByText('Esta estratégia não usa linhas sobre o preço')).toBeDefined();
  });

  test('the layer failing does not take the candles, the arrows or the table down', async () => {
    const harness = show({ respondLayers: () => errorResponse(500, 'INTERNAL') });
    const surface = await ready(harness);
    expect(
      await screen.findByText(/Não foi possível carregar o placar e as linhas da estratégia/),
    ).toBeDefined();
    expect(list(surface.callsOf('setCandles').at(-1)?.[0])).toHaveLength(960);
    expect(list(surface.callsOf('setMarkers').at(-1)?.[0])).toHaveLength(6);
    expect(list(surface.callsOf('setScore').at(-1)?.[0] ?? [])).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Aproximar/ })).toBeDefined();
  });
});

describe('barra de camadas', () => {
  test('defaults: trades and strategy lines on, stop and target off; no forecast or "esperou" in a backtest', async () => {
    const harness = show();
    await ready(harness);
    expect(pressed('Compras e vendas')).toBe('true');
    expect(pressed('Linhas da estratégia')).toBe('true');
    expect(pressed('Stop e alvo')).toBe('false');
    expect(screen.queryByRole('button', { name: /Previsão/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Esperou/ })).toBeNull();
  });

  test('in the live simulation forecast is on and "esperou" is off', async () => {
    const harness = show({ kind: 'live_paper' });
    await ready(harness);
    expect(pressed('Previsão')).toBe('true');
    expect(pressed('Esperou')).toBe('false');
  });

  test('toggling a layer clears it on the surface, flips aria-pressed and is remembered', async () => {
    const harness = show();
    const surface = await ready(harness);
    await waitFor(() => expect(list(surface.callsOf('setLines').at(-1)?.[0])).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Linhas da estratégia' }));
    await waitFor(() => expect(list(surface.callsOf('setLines').at(-1)?.[0])).toHaveLength(0));
    expect(pressed('Linhas da estratégia')).toBe('false');
    expect(readChartPreferences().layers.strategyLines).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Compras e vendas' }));
    await waitFor(() => expect(list(surface.callsOf('setMarkers').at(-1)?.[0])).toHaveLength(0));
    cleanup();
    const again = show();
    await ready(again);
    expect(pressed('Linhas da estratégia')).toBe('false');
    expect(pressed('Compras e vendas')).toBe('false');
  });

  test('outside the candle of the run the strategy layers are off and not even requested', async () => {
    const harness = show({
      kind: 'live_paper',
      respondProjections: () => dataResponse(buildProjectionsResponse()),
    });
    const surface = await ready(harness);
    await waitFor(() => expect(harness.layersCalls().length).toBeGreaterThan(0));
    const before = harness.layersCalls().length;
    fireEvent.click(screen.getByRole('button', { name: /^4h/ }));
    await waitFor(() =>
      expect(list(surface.callsOf('setScore').at(-1)?.[0] ?? [])).toHaveLength(0),
    );
    expect(list(surface.callsOf('setLines').at(-1)?.[0] ?? [])).toHaveLength(0);
    expect(harness.layersCalls()).toHaveLength(before);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Linhas da estratégia' }).disabled,
    ).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previsão' }).disabled).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Compras e vendas' }).disabled,
    ).toBe(false);
  });

  test('on the phone the list is collapsed behind "Camadas do gráfico" (by class) and the button opens it', async () => {
    const harness = show();
    await ready(harness);
    const toggle = screen.getByRole('button', { name: 'Camadas do gráfico', expanded: false });
    const group = screen.getByRole('group', { name: 'Camadas do gráfico' });
    expect(group.className).toContain('layersClosed');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(group.className).toContain('layersOpen');
    const css = readFileSync(
      new URL('../src/runs/candle-chart/CandleChart.module.css', import.meta.url),
      'utf8',
    );
    const phone = css.slice(css.indexOf('@media (max-width: 639px)'));
    expect(phone).toMatch(/\.layersClosed\s*\{\s*display:\s*none/);
    expect(phone).toMatch(/\.layerBar \.layersToggle\s*\{\s*display:\s*inline-flex/);
    expect(css.slice(0, css.indexOf('@media'))).toMatch(
      /\.layerBar \.layersToggle\s*\{\s*display:\s*none/,
    );
  });
});

const TRADES = [
  {
    engineKey: 'p1',
    status: 'closed',
    entryPrice: '609',
    quantity: '0.5',
    stopPrice: '600.5',
    targetPrice: '620',
    exitPrice: '612.5',
    openedCandleTime: fillTime(3),
    closedCandleTime: fillTime(8),
  },
  {
    engineKey: 'p2',
    status: 'open',
    entryPrice: '625.5',
    quantity: '0.4',
    stopPrice: '610',
    targetPrice: '640.25',
    openedCandleTime: fillTime(14),
  },
] as const;

describe('camada "Stop e alvo"', () => {
  test('is off at first and, when turned on, draws one box per trade; an open trade runs to the edge', async () => {
    const harness = show({ trades: TRADES });
    const surface = await ready(harness);
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
    expect(surface.callsOf('setLevels').every((call) => list(call[0]).length === 0)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Stop e alvo' }));
    await waitFor(() => expect(list(surface.callsOf('setLevels').at(-1)?.[0])).toHaveLength(2));
    expect(list(surface.callsOf('setLevels').at(-1)?.[0])).toStrictEqual([
      {
        key: 'p1',
        entryTime: fillTime(3) / 1_000,
        exitTime: fillTime(8) / 1_000,
        entry: 609,
        stop: 600.5,
        target: 620,
      },
      {
        key: 'p2',
        entryTime: fillTime(14) / 1_000,
        exitTime: null,
        entry: 625.5,
        stop: 610,
        target: 640.25,
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Stop e alvo' }));
    await waitFor(() => expect(list(surface.callsOf('setLevels').at(-1)?.[0])).toHaveLength(0));
  });
});

describe('camada "Esperou" e previsão (simulação ao vivo)', () => {
  const DECISIONS = [
    {
      candleTime: FIXTURE_FROM + 5 * FIXTURE_HOUR,
      closedAt: FIXTURE_FROM + 6 * FIXTURE_HOUR,
      action: 'HOLD',
      outcome: 'waited',
      score: '1',
      scoreThreshold: '2',
    },
    {
      candleTime: FIXTURE_FROM + 6 * FIXTURE_HOUR,
      closedAt: FIXTURE_FROM + 7 * FIXTURE_HOUR,
      action: 'BUY',
      outcome: 'bought',
      score: '2',
      scoreThreshold: '2',
    },
    {
      candleTime: FIXTURE_FROM + 7 * FIXTURE_HOUR,
      closedAt: FIXTURE_FROM + 8 * FIXTURE_HOUR,
      action: 'HOLD',
      outcome: 'waited',
      score: '0',
      scoreThreshold: '2',
    },
  ];

  test('"esperou" is off at first; on, it puts one dot on each waited candle', async () => {
    const harness = show({
      kind: 'live_paper',
      build: (overrides) => ({ ...buildFixtureChart(overrides), decisions: DECISIONS }),
    });
    const surface = await ready(harness);
    await waitFor(() => expect(surface.callsOf('setWaited').length).toBeGreaterThan(0));
    expect(list(surface.callsOf('setWaited').at(-1)?.[0])).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Esperou' }));
    await waitFor(() =>
      expect(surface.callsOf('setWaited').at(-1)?.[0]).toStrictEqual([
        (FIXTURE_FROM + 5 * FIXTURE_HOUR) / 1_000,
        (FIXTURE_FROM + 7 * FIXTURE_HOUR) / 1_000,
      ]),
    );
  });

  test('with more than 500 candles the server sends no decisions and the screen asks to zoom in', async () => {
    const harness = show({ kind: 'live_paper' });
    await ready(harness);
    fireEvent.click(await screen.findByRole('button', { name: 'Esperou' }));
    expect(await screen.findByText('Aproxime o gráfico para ver cada decisão')).toBeDefined();
  });

  test('the forecast sends the trend with its band to the surface and switching it off clears it', async () => {
    const harness = show({
      kind: 'live_paper',
      respondProjections: () => dataResponse(buildProjectionsResponse()),
    });
    const surface = await ready(harness);
    await waitFor(() => expect(surface.callsOf('setProjection').at(-1)?.[0]).not.toBeNull());
    const projection = surface.callsOf('setProjection').at(-1)?.[0];
    expect(projection).toMatchObject({ side: 'buy', base: 12.905, low: 12.778, high: 13.032 });
    fireEvent.click(screen.getByRole('button', { name: 'Previsão' }));
    await waitFor(() => expect(surface.callsOf('setProjection').at(-1)?.[0]).toBeNull());
  });

  test('a backtest never draws the forecast: only the history card asks for the projections', async () => {
    const harness = show({ respondProjections: () => dataResponse(buildProjectionsResponse()) });
    const surface = await ready(harness);
    await act(async () => {
      await Promise.resolve();
    });
    expect(surface.callsOf('setProjection').every((call) => call[0] === null)).toBe(true);
    expect(screen.queryByRole('complementary', { name: 'Próxima vela de perto' })).toBeNull();
    const calls = harness.app.fake.callsTo('GET', '/v1/runs/run-1/projections');
    expect(calls.every((call) => call.query.get('cursor') === null)).toBe(true);
  });
});
