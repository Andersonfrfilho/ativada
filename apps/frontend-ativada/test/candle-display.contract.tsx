// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { buildFixtureChart } from './fixtures/trade-chart.fixture.js';
import type { FakeChartSurface } from './support/fake-chart-surface.js';
import { dataResponse, type RecordedCall } from './support/fake-fetch.js';
import {
  FIXTURE_FROM,
  FIXTURE_HOUR,
  showCandleCard,
  type CandleCardHarness,
  type CandleCardOptions,
} from './support/candle-card-harness.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const MINUTE = 60_000;
const RUN = 15 * MINUTE;
const SHOWN = 3 * MINUTE;
const LEGEND = 'Gráfico em 3 min · opiniões a cada 15 min';
const PHRASE = 'Mais velas dão mais detalhe visual; não melhoram a previsão nem criam vantagem.';

function layers15(call: RecordedCall): Response {
  const from = Number(call.query.get('from'));
  const to = Number(call.query.get('to'));
  const candleTimes: number[] = [];
  for (let time = from; time < to; time += RUN) candleTimes.push(time);
  const score = candleTimes.map((time) => String(Math.round(time / RUN) % 5));
  return dataResponse({
    version: 'layers-1',
    timeframe: '15m',
    from,
    to,
    candleTimes,
    score,
    actions: score.map(() => 'HOLD'),
    atr: candleTimes.map(() => '0.50000000'),
    lines: [
      {
        key: 'rule:ema',
        ruleId: 'ema',
        role: 'ema_fast',
        label: 'Média rápida',
        values: candleTimes.map((time) => String(600 + (Math.round(time / RUN) % 7))),
      },
    ],
    thresholds: [{ from: FIXTURE_FROM, to: from + 3 * RUN, buy: '2', sell: '-2' }],
  });
}

const WAITED = [
  {
    candleTime: FIXTURE_FROM + 5 * RUN,
    closedAt: FIXTURE_FROM + 6 * RUN,
    action: 'HOLD',
    outcome: 'waited',
    score: '1',
    scoreThreshold: '2',
  },
];

function show(options: CandleCardOptions = {}): CandleCardHarness {
  return showCandleCard({
    kind: 'live_paper',
    marketDisplayTimeframes: ['3m'],
    runOverrides: { timeframe: '15m' },
    build: (overrides) => ({
      ...buildFixtureChart(overrides),
      timeframe: '15m',
      decisions: WAITED,
    }),
    respondLayers: layers15,
    ...options,
  });
}

async function ready(harness: CandleCardHarness): Promise<FakeChartSurface> {
  await waitFor(() =>
    expect(
      harness.surfaces.find((candidate) => !candidate.isDestroyed())?.callsOf('setCandles').length,
    ).toBeGreaterThan(0),
  );
  const surface = harness.surfaces.find((candidate) => !candidate.isDestroyed());
  if (surface === undefined) throw new Error('nenhuma superfície viva');
  return surface;
}

function list(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('lista esperada');
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new Error('objeto esperado');
    return Object.fromEntries(Object.entries(item));
  });
}

function pressed(name: RegExp | string): string | null {
  return screen.getByRole('button', { name }).getAttribute('aria-pressed');
}

function callsOfTimeframe(harness: CandleCardHarness, timeframe: string): RecordedCall[] {
  return harness.candleCalls().filter((call) => call.query.get('timeframe') === timeframe);
}

describe('gráfico em velas de 3 min sobre a execução de 15 min', () => {
  test('a simulação ao vivo de 15 min abre em 3 min, com a legenda e a frase fixa, e pede UMA página de 1.000 velas', async () => {
    const harness = show();
    const surface = await ready(harness);
    expect(pressed(/^3m/)).toBe('true');
    expect(await screen.findByText(LEGEND)).toBeDefined();
    expect(screen.getByText(PHRASE)).toBeDefined();
    const [first] = callsOfTimeframe(harness, '3m');
    const span = Number(first?.query.get('to')) - Number(first?.query.get('from'));
    expect(span / SHOWN).toBe(1_000);
    expect(callsOfTimeframe(harness, '3m')).toHaveLength(1);
    expect(list(surface.callsOf('setCandles').at(-1)?.[0])).toHaveLength(1_000);
  });

  test('o backtest de 15 min abre na vela da execução e oferece 3 min; sem o ambiente, nada de 3 min', async () => {
    const harness = show({ kind: 'backtest' });
    await ready(harness);
    expect(pressed(/^15m/)).toBe('true');
    expect(screen.queryByText(LEGEND)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^3m/ }));
    expect(await screen.findByText(LEGEND)).toBeDefined();
    cleanup();
    const without = show({ marketDisplayTimeframes: [] });
    await ready(without);
    expect(screen.queryByRole('button', { name: /^3m/ })).toBeNull();
    expect(callsOfTimeframe(without, '3m')).toHaveLength(0);
  });

  test('placar e linhas viram degraus de 5 velas a partir do fechamento da vela decidida (nunca antes)', async () => {
    const harness = show();
    const surface = await ready(harness);
    await waitFor(() =>
      expect(list(surface.callsOf('setScore').at(-1)?.[0]).length).toBeGreaterThan(0),
    );
    const call = harness.layersCalls()[0];
    const from = Number(call?.query.get('from'));
    const to = Number(call?.query.get('to'));
    expect((to - from) % RUN).toBe(0);
    const [bars] = surface.callsOf('setScore').at(-1) ?? [];
    const times = list(bars).map((bar) => Number(bar['time']));
    expect(times).toHaveLength(((to - from) / RUN) * 5);
    expect(times.every((time, index) => time === (from + RUN + index * SHOWN) / 1_000)).toBe(true);
    const values = list(bars).map((bar) => bar['value']);
    expect(new Set(values.slice(0, 5)).size).toBe(1);
    const points = list(list(surface.callsOf('setLines').at(-1)?.[0])[0]?.['points']);
    expect(points).toHaveLength(times.length);
    expect(Number(points[0]?.['time'])).toBe((from + RUN) / 1_000);
  });

  test('"esperou" cai na primeira vela de 3 min em que a decisão já existia', async () => {
    const harness = show();
    const surface = await ready(harness);
    fireEvent.click(screen.getByRole('button', { name: 'Esperou' }));
    await waitFor(() =>
      expect(surface.callsOf('setWaited').at(-1)?.[0]).toStrictEqual([
        (FIXTURE_FROM + 6 * RUN) / 1_000,
      ]),
    );
  });

  test('o corte da retenção avisa e a paginação à esquerda para ali', async () => {
    const cut = FIXTURE_FROM + 40 * 24 * FIXTURE_HOUR - 2 * FIXTURE_HOUR;
    const harness = show({ retentionStart: cut });
    await ready(harness);
    expect(await screen.findByText('Velas de 3 min existem só dos últimos 90 dias.')).toBeDefined();
    const before = callsOfTimeframe(harness, '3m').length;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(callsOfTimeframe(harness, '3m')).toHaveLength(before);
  });
});

describe('a visão de 15 min continua idêntica à da spec 009', () => {
  test('em 15 min as camadas chegam à superfície nos instantes originais, sem degraus e sem a legenda', async () => {
    const harness = show();
    const surface = await ready(harness);
    fireEvent.click(await screen.findByRole('button', { name: /^15m/ }));
    await waitFor(() => expect(pressed(/^15m/)).toBe('true'));
    expect(screen.queryByText(LEGEND)).toBeNull();
    await waitFor(() => {
      const call = harness.layersCalls().at(-1);
      const [bars] = surface.callsOf('setScore').at(-1) ?? [];
      const times = list(bars).map((bar) => Number(bar['time']));
      expect(times[0]).toBe(Number(call?.query.get('from')) / 1_000);
      expect(times[1]).toBe((times[0] ?? 0) + RUN / 1_000);
    });
  });
});
