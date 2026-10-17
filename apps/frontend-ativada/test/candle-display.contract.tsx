// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { CHART_PREFERENCES_STORAGE_KEY } from '../src/runs/candle-chart/candle-chart.constant.js';
import { formatTimeInZone } from '../src/format/zoned-time.js';
import { STREAM_STATUS } from '../src/live/stream.constant.js';
import type { StreamCandle } from '../src/live/stream.validation.js';
import { buildFixtureChart, FIXTURE_DAY, fillTime } from './fixtures/trade-chart.fixture.js';
import type { FakeChartSurface } from './support/fake-chart-surface.js';
import { buildProjectionsResponse } from './support/candle-chart-fixtures.js';
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
    thresholds: [{ from: FIXTURE_FROM, to, buy: '2', sell: '-2' }],
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
    // Acompanhando o fim, a ponta vai até o fim da vela de 15 min em curso (as de 3 min fecham antes da de 15).
    expect(Number(first?.query.get('to'))).toBe(FIXTURE_FROM + 40 * FIXTURE_DAY + RUN);
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

  test('mexer a cruz não refaz as linhas, o placar nem as marcas (o arrasto não pode redesenhar camadas)', async () => {
    const harness = show();
    const surface = await ready(harness);
    await waitFor(() =>
      expect(list(surface.callsOf('setLines').at(-1)?.[0]).length).toBeGreaterThan(0),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const before = ['setLines', 'setScore', 'setMarkers', 'setWaited', 'setLevels'].map(
      (method) => surface.calls.filter((call) => call.method === method).length,
    );
    for (const index of [10, 20, 30]) act(() => surface.emitCrosshair(index));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const after = ['setLines', 'setScore', 'setMarkers', 'setWaited', 'setLevels'].map(
      (method) => surface.calls.filter((call) => call.method === method).length,
    );
    expect(after).toEqual(before);
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

const CLOSED_TRADE = {
  status: 'closed',
  entryPrice: '609',
  quantity: '0.5',
  openedCandleTime: fillTime(3),
};

function aroundExit(): string {
  const params = new URLSearchParams({
    de: new Date(fillTime(8) - 6 * FIXTURE_HOUR).toISOString(),
    ate: new Date(fillTime(8) + 6 * FIXTURE_HOUR).toISOString(),
  });
  return `?${params.toString()}`;
}

function markersOf(surface: FakeChartSurface): readonly Record<string, unknown>[] {
  return list(surface.callsOf('setMarkers').at(-1)?.[0]);
}

describe('compras, vendas e a saída decidida dentro da vela de 15 min', () => {
  test('alvo e proteção ganham o colchete sobre as 5 velas; a saída por sinal e a compra não', async () => {
    const trades = [
      { ...CLOSED_TRADE, engineKey: 'p1', exitReason: 'stop', closedCandleTime: fillTime(8) },
      { ...CLOSED_TRADE, engineKey: 'p2', exitReason: 'signal', closedCandleTime: fillTime(20) },
    ];
    const harness = show({ trades });
    const surface = await ready(harness);
    await waitFor(() =>
      expect(markersOf(surface).some((m) => m['endTime'] !== undefined)).toBe(true),
    );
    const byKey = new Map(markersOf(surface).map((marker) => [marker['key'], marker]));
    expect(byKey.get('p1:sell')).toMatchObject({
      time: fillTime(8) / 1_000,
      endTime: (fillTime(8) + RUN - SHOWN) / 1_000,
    });
    expect(byKey.get('p1:buy')?.['endTime']).toBeUndefined();
    expect(byKey.get('p2:sell')?.['endTime']).toBeUndefined();
  });

  test('a dica do colchete diz entre quais horas a simulação decidiu', async () => {
    const trades = [
      { ...CLOSED_TRADE, engineKey: 'p1', exitReason: 'stop', closedCandleTime: fillTime(8) },
    ];
    const harness = show({ trades, search: aroundExit() });
    const surface = await ready(harness);
    await waitFor(() =>
      expect(markersOf(surface).some((m) => m['endTime'] !== undefined)).toBe(true),
    );
    const candles = list(surface.callsOf('setCandles').at(-1)?.[0]);
    const index = candles.findIndex((candle) => candle['time'] === (fillTime(8) + SHOWN) / 1_000);
    act(() => surface.emitCrosshair(index));
    const from = formatTimeInZone(fillTime(8), 'America/Sao_Paulo');
    const to = formatTimeInZone(fillTime(8) + RUN, 'America/Sao_Paulo');
    expect(
      (
        await screen.findAllByText(
          `Saiu pela proteção entre ${from} e ${to} (a simulação decide em velas de 15 min)`,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('a opinião que valia na vela apontada', () => {
  test('a legenda diz quando a opinião nasceu e até quando vale, e a equipe fala da vela decidida', async () => {
    const pointed: (number | undefined)[] = [];
    const harness = show({
      aside: (openTime) => {
        pointed.push(openTime);
        return <p>equipe</p>;
      },
    });
    const surface = await ready(harness);
    const candles = list(surface.callsOf('setCandles').at(-1)?.[0]);
    const index = 500;
    const open = Number(candles[index]?.['time']) * 1_000;
    act(() => surface.emitCrosshair(index));
    const issued = Math.floor(open / RUN) * RUN;
    const clock = (value: number): string => formatTimeInZone(value, 'America/Sao_Paulo');
    expect(
      await screen.findByText(`Opinião das ${clock(issued)} · vale até ${clock(issued + RUN)}`),
    ).toBeDefined();
    await waitFor(() => expect(pointed.at(-1)).toBe(issued - RUN));
  });
});

const RUN_END = FIXTURE_FROM + 40 * FIXTURE_DAY;

function streamed(overrides: Partial<StreamCandle>): StreamCandle {
  return {
    type: 'candle',
    symbol: 'BNBUSDT',
    timeframe: '3m',
    openTime: RUN_END,
    open: '650.00',
    high: '652.50',
    low: '649.00',
    close: '651.25',
    volume: '120.5',
    closed: false,
    at: RUN_END + 1_000,
    ...overrides,
  };
}

describe('a vela de 15 min em formação', () => {
  test('sem a kline de 15 min, a legenda é composta da vela de 3 min; com ela, a kline é a fonte', async () => {
    const harness = show();
    const surface = await ready(harness);
    act(() => harness.app.stream.setStatus(STREAM_STATUS.LIVE));
    act(() => harness.app.stream.candle(streamed({ openTime: RUN_END + SHOWN })));
    const range = `${formatTimeInZone(RUN_END, 'America/Sao_Paulo')}–${formatTimeInZone(RUN_END + RUN, 'America/Sao_Paulo')}`;
    expect(await screen.findByText(`Vela de 15 min em formação (${range})`)).toBeDefined();
    await waitFor(() =>
      expect(surface.callsOf('setFormingSlot').at(-1)?.[0]).toStrictEqual({
        from: RUN_END / 1_000,
        to: (RUN_END + RUN) / 1_000,
        barSeconds: SHOWN / 1_000,
      }),
    );
    expect(screen.getAllByText('652,50').length).toBeGreaterThan(0);
    act(() =>
      harness.app.stream.candle(
        streamed({ timeframe: '15m', high: '660.00', close: '655.00', at: RUN_END + 2_000 }),
      ),
    );
    await waitFor(() => expect(screen.getAllByText('660,00').length).toBeGreaterThan(0));
  });
});

describe('"Próxima vela de perto" com as velas de 3 min', () => {
  test('mostra as 5 vagas de 3 min da vela de 15 min em formação, com a em formação marcada por ícone e palavra', async () => {
    const harness = show({ respondProjections: () => dataResponse(buildProjectionsResponse()) });
    await ready(harness);
    act(() => harness.app.stream.setStatus(STREAM_STATUS.LIVE));
    const section = await screen.findByRole('region', {
      name: 'As velas de 3 min desta vela de 15 min',
    });
    // A previsão do fixture é velha: o painel desenha a vela de 15 min do relógio.
    const start = Math.floor(Date.now() / RUN) * RUN;
    expect(section.querySelectorAll('li')).toHaveLength(5);
    expect(section.textContent).toContain(formatTimeInZone(start, 'America/Sao_Paulo'));
    act(() =>
      harness.app.stream.candle(streamed({ openTime: start + 2 * SHOWN, close: '651.25' })),
    );
    await waitFor(() => expect(section.textContent).toContain('em formação'));
    expect(section.querySelectorAll('li')[2]?.textContent).toContain('651,25');
  });
});

function chartTip(): HTMLElement {
  const tip = [...document.querySelectorAll<HTMLElement>('[role="tooltip"]')].find((element) =>
    element.classList.contains('tooltip'),
  );
  if (tip === undefined) throw new Error('balão do gráfico não encontrado');
  return tip;
}

describe('balão de valores ao passar o mouse', () => {
  test('em 3 min mostra hora, vela de 15 min, A/M/m/F, volume, linhas e placar da opinião que valia; Esc fecha', async () => {
    const harness = show();
    const surface = await ready(harness);
    await waitFor(() =>
      expect(list(surface.callsOf('setScore').at(-1)?.[0]).length).toBeGreaterThan(0),
    );
    act(() => surface.emitCrosshair(500));
    await waitFor(() => expect(chartTip().hidden).toBe(false));
    const tip = chartTip();
    expect(tip.textContent).toContain('Dentro da vela de 15 min das');
    for (const label of ['Abertura', 'Máxima', 'Mínima', 'Fechamento', 'Volume']) {
      expect(tip.textContent).toContain(label);
    }
    expect(tip.textContent).toContain('Média rápida');
    expect(tip.textContent).toContain('Placar');
    expect(tip.textContent).toContain('compra em +2, venda em −2');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(chartTip().hidden).toBe(true));
  });

  test('numa vela com operação diz a compra com preço, quantidade e taxa; sem decisão, só os valores', async () => {
    const harness = show({
      kind: 'backtest',
      search: `?${new URLSearchParams({
        de: new Date(fillTime(3) - 6 * FIXTURE_HOUR).toISOString(),
        ate: new Date(fillTime(3) + 6 * FIXTURE_HOUR).toISOString(),
      }).toString()}`,
    });
    const surface = await ready(harness);
    const candles = list(surface.callsOf('setCandles').at(-1)?.[0]);
    const index = candles.findIndex((candle) => candle['time'] === fillTime(3) / 1_000);
    act(() => surface.emitCrosshair(index));
    await waitFor(() => expect(chartTip().hidden).toBe(false));
    const tip = chartTip();
    expect(tip.textContent).toContain('Compra a 609,00 · 0,5 BNB · taxa 0,3045 USDT');
    act(() => surface.emitCrosshair(index + 5));
    await waitFor(() => expect(chartTip().textContent).not.toContain('Compra a'));
  });

  test('os valores do balão não quebram: ficam numa linha só, em colunas rótulo e valor', () => {
    const css = readFileSync(
      new URL('../src/runs/candle-chart/CandleChart.module.css', import.meta.url),
      'utf8',
    );
    const rule = css.slice(css.indexOf('.tipValues dd'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/white-space:\s*nowrap/);
    expect(css).toMatch(/\.tipValues\s*\{[^}]*grid-template-columns/);
  });
});

describe('começo da simulação', () => {
  test('a marca vertical é entregue à superfície e "Ir ao início" centraliza o começo (só em 3 min)', async () => {
    const harness = show();
    const surface = await ready(harness);
    await waitFor(() =>
      expect(surface.callsOf('setRunStart').at(-1)?.[0]).toBe(FIXTURE_FROM / 1_000),
    );
    fireEvent.click(screen.getByRole('button', { name: /Ir ao início da simulação/ }));
    expect(surface.callsOf('centerOn').at(-1)?.[0]).toBe(FIXTURE_FROM / 1_000);
    fireEvent.click(screen.getByRole('button', { name: /^15m/ }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Ir ao início da simulação/ })).toBeNull(),
    );
  });

  test('uma simulação nova abre com ao menos 40 velas de contexto antes do começo', async () => {
    const young = FIXTURE_FROM + 90 * MINUTE;
    const harness = show({
      build: (o) => ({
        ...buildFixtureChart(o),
        timeframe: '15m',
        runRange: { from: FIXTURE_FROM, to: young },
      }),
    });
    const surface = await ready(harness);
    const candles = list(surface.callsOf('setCandles').at(-1)?.[0]);
    expect(Number(candles[0]?.['time']) * 1_000).toBeLessThanOrEqual(FIXTURE_FROM - 40 * SHOWN);
  });
});

describe('tabela de operações no celular', () => {
  test('não quebra número no meio nem espreme as colunas: a tabela rola de lado', () => {
    const css = readFileSync(
      new URL('../src/runs/TradesTable.module.css', import.meta.url),
      'utf8',
    );
    expect(css).not.toMatch(/overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.scroller table\s*\{[^}]*min-width:\s*\d+px/);
  });
});

describe('balão de valores opcional', () => {
  const TOGGLE = /Balão de valores/;

  async function pointAt(harness: CandleCardHarness, index: number): Promise<FakeChartSurface> {
    const surface = await ready(harness);
    act(() => surface.emitCrosshair(index));
    return surface;
  }

  test('ligado por padrão; o interruptor desliga, mostra a palavra, aria-pressed e é lembrado', async () => {
    const harness = show();
    await pointAt(harness, 500);
    await waitFor(() => expect(chartTip().hidden).toBe(false));
    const toggle = screen.getByRole('button', { name: TOGGLE });
    expect(toggle.textContent).toContain('ligado');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => expect(chartTip().hidden).toBe(true));
    expect(screen.getByRole('button', { name: TOGGLE }).textContent).toContain('desligado');
    expect(screen.getByRole('button', { name: TOGGLE }).getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem(CHART_PREFERENCES_STORAGE_KEY)).toContain('"isTooltipOn":false');
    cleanup();
    await ready(show());
    expect(screen.getByRole('button', { name: TOGGLE }).getAttribute('aria-pressed')).toBe('false');
  });

  test('desligado, o mouse não abre nada; clicar numa vela abre e fixa; Esc fecha; a legenda fixa continua', async () => {
    localStorage.setItem(
      CHART_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ layers: {}, isTooltipOn: false }),
    );
    const harness = show();
    const surface = await pointAt(harness, 500);
    expect(chartTip().hidden).toBe(true);
    expect(screen.getByText(/^LINK|^BNB\/USDT · 3m/)).toBeDefined();
    const canvas = screen.getByRole('img', { name: /Gráfico de velas/ });
    fireEvent.pointerDown(canvas, { pointerType: 'mouse' });
    await waitFor(() => expect(chartTip().hidden).toBe(false));
    const pinned = chartTip().textContent;
    act(() => surface.emitCrosshair(10));
    await waitFor(() => expect(chartTip().textContent).toBe(pinned));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(chartTip().hidden).toBe(true));
  });

  test('a tecla V alterna, menos com o foco num campo', async () => {
    const harness = show();
    await ready(harness);
    const toggle = (): HTMLElement => screen.getByRole('button', { name: TOGGLE });
    fireEvent.keyDown(document.body, { key: 'v' });
    await waitFor(() => expect(toggle().getAttribute('aria-pressed')).toBe('false'));
    const field = document.createElement('input');
    document.body.append(field);
    fireEvent.keyDown(field, { key: 'v' });
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    field.remove();
    fireEvent.keyDown(document.body, { key: 'V' });
    await waitFor(() => expect(toggle().getAttribute('aria-pressed')).toBe('true'));
  });

  test('um toque abre e fixa mesmo com o balão ligado', async () => {
    const harness = show();
    const surface = await pointAt(harness, 500);
    const canvas = screen.getByRole('img', { name: /Gráfico de velas/ });
    fireEvent.pointerDown(canvas, { pointerType: 'touch' });
    act(() => surface.emitCrosshair(null));
    await waitFor(() => expect(chartTip().hidden).toBe(false));
  });
});
