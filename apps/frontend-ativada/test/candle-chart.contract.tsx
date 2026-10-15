// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { buildOhlcText } from '../src/runs/candle-chart/ohlc-text.js';
import { CHART_PREFERENCES_STORAGE_KEY } from '../src/runs/candle-chart/candle-chart.constant.js';
import {
  buildClusteredFixtureChart,
  FIXTURE_CLUSTER,
  FIXTURE_DAY,
  fillTime,
} from './fixtures/trade-chart.fixture.js';
import type { FakeChartSurface } from './support/fake-chart-surface.js';
import { dataResponse, errorResponse } from './support/fake-fetch.js';
import {
  buildCandlesBetween,
  FIXTURE_FROM,
  FIXTURE_HOUR,
  showCandleCard,
  timeframeStep,
  type CandleCardHarness,
} from './support/candle-card-harness.js';

const PAGE = 1_000;

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function aliveSurface(harness: CandleCardHarness): FakeChartSurface {
  const surface = harness.surfaces.find((candidate) => !candidate.isDestroyed());
  if (surface === undefined) throw new Error('nenhuma superfície viva');
  return surface;
}

async function readySurface(harness: CandleCardHarness): Promise<FakeChartSurface> {
  await waitFor(() => {
    const surface = harness.surfaces.find((candidate) => !candidate.isDestroyed());
    expect(surface?.callsOf('setCandles').length ?? 0).toBeGreaterThan(0);
  });
  return aliveSurface(harness);
}

function lastArgument(
  surface: FakeChartSurface,
  method: 'setCandles' | 'setVolume' | 'setMarkers',
): unknown {
  return surface.callsOf(method).at(-1)?.[0];
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error('objeto esperado');
  return Object.fromEntries(Object.entries(value));
}

function asList(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('lista esperada');
  return value.map((item: unknown) => toRecord(item));
}

describe('CandleChart: dados certos à superfície', () => {
  test('asks for the last page of candles of the run and hands candles, volume and arrows to the surface', async () => {
    const harness = showCandleCard();
    const surface = await readySurface(harness);
    const call = harness.candleCalls()[0];
    expect(call?.query.get('symbol')).toBe('BNBUSDT');
    expect(call?.query.get('timeframe')).toBe('1h');
    expect(call?.query.get('from')).toBe(String(FIXTURE_FROM));
    expect(call?.query.get('to')).toBe(String(FIXTURE_FROM + 40 * FIXTURE_DAY));

    const raw = buildCandlesBetween(FIXTURE_FROM, FIXTURE_FROM + 40 * FIXTURE_DAY, FIXTURE_HOUR);
    const candles = asList(lastArgument(surface, 'setCandles'));
    expect(candles).toHaveLength(960);
    expect(candles[0]).toStrictEqual({
      time: FIXTURE_FROM / 1_000,
      open: Number(raw[0]?.['open']),
      high: Number(raw[0]?.['high']),
      low: Number(raw[0]?.['low']),
      close: Number(raw[0]?.['close']),
    });
    const volume = asList(lastArgument(surface, 'setVolume'));
    expect(volume).toHaveLength(960);
    expect(volume[0]).toStrictEqual({
      time: FIXTURE_FROM / 1_000,
      value: Number(raw[0]?.['volume']),
      isUp: true,
    });
    const markers = asList(lastArgument(surface, 'setMarkers'));
    expect(markers.map((marker) => marker['label'])).toStrictEqual([
      'Compra',
      'Venda',
      'Compra',
      'Venda',
      'Compra',
      'Venda',
    ]);
    expect(markers[0]?.['time']).toBe(Math.floor(fillTime(3) / FIXTURE_HOUR) * 3_600);
    expect(surface.callsOf('setTheme').length).toBeGreaterThan(0);
    expect(surface.callsOf('setTimeLabels').length).toBeGreaterThan(0);
  });

  test('opens on the last bars when following the end and on the whole range when the URL has one', async () => {
    const following = showCandleCard();
    const surface = await readySurface(following);
    await waitFor(() => expect(surface.callsOf('showLast')).toEqual([[150]]));
    cleanup();
    const to = FIXTURE_FROM + 20 * FIXTURE_DAY;
    const params = new URLSearchParams({
      de: new Date(to - 7 * FIXTURE_DAY).toISOString(),
      ate: new Date(to).toISOString(),
    });
    const fixed = showCandleCard({ search: `?${params.toString()}` });
    const fixedSurface = await readySurface(fixed);
    await waitFor(() => expect(fixedSurface.callsOf('fit').length).toBe(1));
    const call = fixed.candleCalls()[0];
    expect(call?.query.get('from')).toBe(String(to - 7 * FIXTURE_DAY));
    expect(call?.query.get('to')).toBe(String(to));
  });

  test('shows the last candle in the legend and the one under the cross when the mouse moves', async () => {
    const harness = showCandleCard();
    const surface = await readySurface(harness);
    const raw = buildCandlesBetween(FIXTURE_FROM, FIXTURE_FROM + 40 * FIXTURE_DAY, FIXTURE_HOUR);
    const input = (index: number): Parameters<typeof buildOhlcText>[0] => ({
      candle: {
        openTime: Number(raw[index]?.['openTime']),
        open: String(raw[index]?.['open']),
        high: String(raw[index]?.['high']),
        low: String(raw[index]?.['low']),
        close: String(raw[index]?.['close']),
        volume: String(raw[index]?.['volume']),
      },
      previousClose: String(raw[index - 1]?.['close']),
      symbol: 'BNB/USDT',
      timeframe: '1h',
      timeZone: 'America/Sao_Paulo',
      isForming: false,
    });
    expect(await screen.findByText(buildOhlcText(input(959)).title)).toBeDefined();
    act(() => surface.emitCrosshair(86));
    expect(await screen.findByText(buildOhlcText(input(86)).title)).toBeDefined();
    expect(screen.queryByText(buildOhlcText(input(959)).title)).toBeNull();
  });
});

describe('CandleChart: página anterior à esquerda', () => {
  test('asks for the page before the first candle near the left edge, once, and joins without repeating', async () => {
    const harness = showCandleCard({ runDays: 100 });
    const surface = await readySurface(harness);
    const first = FIXTURE_FROM + 100 * FIXTURE_DAY - PAGE * FIXTURE_HOUR;
    expect(asList(lastArgument(surface, 'setCandles'))).toHaveLength(PAGE);
    act(() => surface.emitVisibleRange({ from: 400, to: 700 }));
    expect(harness.candleCalls()).toHaveLength(1);
    act(() => {
      surface.emitVisibleRange({ from: 10, to: 300 });
      surface.emitVisibleRange({ from: 9, to: 299 });
    });
    await waitFor(() => expect(harness.candleCalls()).toHaveLength(2));
    const page = harness.candleCalls()[1];
    expect(page?.query.get('to')).toBe(String(first));
    expect(page?.query.get('from')).toBe(String(first - PAGE * FIXTURE_HOUR));
    await waitFor(() => expect(asList(lastArgument(surface, 'setCandles'))).toHaveLength(2 * PAGE));
    const times = asList(lastArgument(surface, 'setCandles')).map((candle) => candle['time']);
    expect(new Set(times).size).toBe(2 * PAGE);
    expect(times).toStrictEqual([...times].sort());
    expect(harness.candleCalls()).toHaveLength(2);
  });

  test('stops asking at the start of the run', async () => {
    const harness = showCandleCard({ runDays: 50 });
    const surface = await readySurface(harness);
    act(() => surface.emitVisibleRange({ from: 5, to: 205 }));
    await waitFor(() => expect(harness.candleCalls()).toHaveLength(2));
    const older = harness.candleCalls()[1];
    expect(older?.query.get('from')).toBe(String(FIXTURE_FROM));
    await waitFor(() => expect(asList(lastArgument(surface, 'setCandles'))).toHaveLength(1_200));
    act(() => surface.emitVisibleRange({ from: 0, to: 200 }));
    expect(harness.candleCalls()).toHaveLength(2);
  });
});

describe('CandleChart: troca de vela', () => {
  test('keeps the center instant: asks the new candle around it and centers the chart on it', async () => {
    const harness = showCandleCard({ runDays: 100 });
    const surface = await readySurface(harness);
    const firstOpen = FIXTURE_FROM + 100 * FIXTURE_DAY - PAGE * FIXTURE_HOUR;
    act(() => surface.emitVisibleRange({ from: 400, to: 600 }));
    fireEvent.click(screen.getByRole('button', { name: /^4h/ }));
    await waitFor(() => expect(harness.candleCalls()).toHaveLength(2));
    const call = harness.candleCalls()[1];
    expect(call?.query.get('timeframe')).toBe('4h');
    const center = firstOpen + 500 * FIXTURE_HOUR;
    const from = Number(call?.query.get('from'));
    const to = Number(call?.query.get('to'));
    expect(from).toBeLessThanOrEqual(center);
    expect(to).toBeGreaterThan(center);
    await waitFor(() => expect(surface.callsOf('centerOn').at(-1)).toEqual([center / 1_000]));
    expect(screen.getByRole('button', { name: /^4h/ }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem(CHART_PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  test('outside the candle of the run the notice says the strategy layers are gone, and it leaves when back', async () => {
    const harness = showCandleCard();
    const surface = await readySurface(harness);
    act(() => surface.emitVisibleRange({ from: 100, to: 300 }));
    expect(screen.queryByText(/só aparecem na vela de 1 h/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^1d/ }));
    expect(
      await screen.findByText(
        'Previsão, placar, canal e "esperou" só aparecem na vela de 1 h, que é a que a estratégia usa.',
      ),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^1h/ }));
    await waitFor(() => expect(screen.queryByText(/só aparecem na vela de 1 h/)).toBeNull());
  });

  test('marks the candle of the run when it opens', async () => {
    showCandleCard();
    const button = await screen.findByRole('button', { name: /^1h/ });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('da execução');
  });
});

describe('CandleChart: botões e seleção', () => {
  test('the zoom buttons call the surface, with 44 px targets by class', async () => {
    const harness = showCandleCard();
    const surface = await readySurface(harness);
    fireEvent.click(await screen.findByRole('button', { name: /Aproximar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Afastar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Agora/ }));
    expect(surface.callsOf('zoom')).toEqual([[1], [-1]]);
    expect(surface.callsOf('scrollToEnd')).toHaveLength(1);
  });

  test('clicking a candle with an arrow selects its operation in the URL, without moving the range', async () => {
    const harness = showCandleCard();
    const surface = await readySurface(harness);
    act(() => surface.emitClick(3 * 24 + 14));
    await waitFor(() => expect(harness.router.state.location.search).toContain('operacao=p1'));
    expect(harness.router.state.location.search).not.toContain('de=');
    const selected = asList(lastArgument(surface, 'setMarkers')).filter(
      (marker) => marker['isSelected'],
    );
    expect(selected.map((marker) => marker['key'])).toStrictEqual(['p1:buy', 'p1:sell']);
    act(() => surface.emitClick(10));
    expect(harness.router.state.location.search).toContain('operacao=p1');
  });

  test('above 500 events the arrows give way to cluster buttons that zoom through the URL', async () => {
    const harness = showCandleCard({ build: buildClusteredFixtureChart });
    const surface = await readySurface(harness);
    expect(asList(lastArgument(surface, 'setMarkers'))).toHaveLength(0);
    fireEvent.click(await screen.findByRole('button', { name: /23 operações|12 compras/ }));
    await waitFor(() =>
      expect(harness.router.state.location.search).toContain(
        encodeURIComponent(new Date(FIXTURE_CLUSTER.startTime).toISOString()),
      ),
    );
  });
});

describe('CandleChart: velas do ambiente e saída da reserva', () => {
  test('offers only the candles the environment has, and the one of the run is always there', async () => {
    showCandleCard({ marketTimeframes: ['1h', '1d'] });
    const group = await screen.findByRole('group', { name: 'Vela do gráfico' });
    const labels = within(group)
      .getAllByRole('button')
      .map((button) => button.textContent?.slice(0, 2));
    expect(labels).toStrictEqual(['1h', '1d']);
    cleanup();
    showCandleCard({ marketTimeframes: ['4h', '1d'] });
    const withRun = await screen.findByRole('group', { name: 'Vela do gráfico' });
    expect(within(withRun).getAllByRole('button')).toHaveLength(3);
  });

  test('a candle the API refuses does not trap the user: back to the run candle, or try again', async () => {
    let isRefusing = true;
    const harness = showCandleCard({
      respondCandles: (call) => {
        const timeframe = call.query.get('timeframe');
        if (isRefusing && timeframe === '4h') return errorResponse(400, 'VALIDATION_FAILED');
        const from = Number(call.query.get('from'));
        const to = Number(call.query.get('to'));
        return dataResponse(buildCandlesBetween(from, to, timeframeStep(timeframe)));
      },
    });
    await readySurface(harness);
    fireEvent.click(screen.getByRole('button', { name: /^4h/ }));
    expect(await screen.findByText(/As velas deste par não estão disponíveis/)).toBeDefined();
    const retry = screen.getByRole('button', { name: 'Tentar de novo' });
    const before = harness.candleCalls().length;
    fireEvent.click(retry);
    await waitFor(() => expect(harness.candleCalls().length).toBeGreaterThan(before));
    await screen.findByRole('button', { name: 'Tentar de novo' });
    isRefusing = false;
    fireEvent.click(screen.getByRole('button', { name: /Voltar para a vela da execução \(1h\)/ }));
    expect(await screen.findByRole('group', { name: 'Vela do gráfico' })).toBeDefined();
    expect(screen.getByRole('button', { name: /^1h/ }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('CandleChart: reserva', () => {
  test('without public candles for the pair the simple chart takes over with its arrows', async () => {
    const harness = showCandleCard({
      respondCandles: () => errorResponse(404, 'CANDLES_NOT_FOUND'),
    });
    expect(await screen.findByRole('group', { name: 'Preço e operações' })).toBeDefined();
    expect(screen.getByText(/As velas deste par não estão disponíveis agora/)).toBeDefined();
    expect(document.querySelectorAll('[data-chart-item]')).toHaveLength(6);
    expect(harness.surfaces).toHaveLength(0);
  });
});
