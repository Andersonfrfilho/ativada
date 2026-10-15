// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { STREAM_STATUS } from '../src/live/stream.constant.js';
import { CHART_KEYBOARD_HELP } from '../src/runs/candle-chart/chart-key-plan.js';
import { fillTime } from './fixtures/trade-chart.fixture.js';
import type { FakeChartSurface } from './support/fake-chart-surface.js';
import { dataResponse } from './support/fake-fetch.js';
import {
  FIXTURE_FROM,
  FIXTURE_HOUR,
  showCandleCard,
  type CandleCardHarness,
  type CandleCardOptions,
} from './support/candle-card-harness.js';
import {
  buildProjectionsResponse,
  FIRST_CANDLE_TIME,
  HOUR_MILLISECONDS,
} from './support/candle-chart-fixtures.js';

afterEach(() => {
  setSystemTime();
  cleanup();
  localStorage.clear();
});

const CANDLE_COUNT = 40 * 24;
const LAST = CANDLE_COUNT - 1;
const PAGE = 1_000;
const FIRST_BUY = (fillTime(3) - FIXTURE_FROM) / FIXTURE_HOUR;
const FIRST_SELL = (fillTime(8) - FIXTURE_FROM) / FIXTURE_HOUR;

async function open(options: CandleCardOptions = {}): Promise<{
  readonly harness: CandleCardHarness;
  readonly surface: FakeChartSurface;
  readonly chart: HTMLElement;
}> {
  const harness = showCandleCard(options);
  act(() => harness.app.stream.setStatus(STREAM_STATUS.LIVE));
  const chart = await screen.findByRole('img', { name: 'Gráfico de velas de BNB/USDT' });
  await waitFor(() =>
    expect(
      harness.surfaces.find((s) => !s.isDestroyed())?.callsOf('setCandles').length,
    ).toBeGreaterThan(0),
  );
  const surface = harness.surfaces.find((candidate) => !candidate.isDestroyed());
  if (surface === undefined) throw new Error('nenhuma superfície viva');
  return { harness, surface, chart };
}

function press(chart: HTMLElement, key: string, shiftKey = false): void {
  fireEvent.keyDown(chart, { key, shiftKey });
}

function crosshair(surface: FakeChartSurface): readonly unknown[] {
  return surface.callsOf('setCrosshair').map((call) => call[0]);
}

function announcer(): HTMLElement {
  const region = document.querySelector<HTMLElement>('figure p[aria-live="polite"]');
  if (region === null) throw new Error('região aria-live ausente');
  return region;
}

// Vela de índice 0: 01/04 00:00 UTC = 31/03 21:00 em Brasília; os preços são os da vela gerada pelo harness.
function firstCandleSpeech(): string {
  const open = 600 + (Math.round(FIXTURE_FROM / FIXTURE_HOUR) % 23);
  const text = (value: number): string => value.toFixed(2).replace('.', ',');
  return `31/03 às 21:00: abertura ${text(open)}, máxima ${text(open + 3.5)}, mínima ${text(open - 2)}, fechamento ${text(open + 1.25)}`;
}

describe('uma parada de Tab', () => {
  test('the chart container is focusable, named, and described by the keys and the text', async () => {
    const { chart } = await open();
    expect(chart.getAttribute('tabindex')).toBe('0');
    expect(chart.getAttribute('aria-roledescription')).toBe('gráfico de velas');
    const ids = (chart.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    const described = ids.map((id) => document.getElementById(id)?.textContent ?? '');
    expect(described[0]).toBe(CHART_KEYBOARD_HELP);
    expect(described[1]).toContain('Preço de BNB/USDT');
    expect(document.querySelectorAll('figure [tabindex="0"]')).toHaveLength(1);
  });
});

describe('setas, Home, End e Esc', () => {
  test('the first arrow lands on the newest candle and the next ones walk back', async () => {
    const { chart, surface } = await open();
    press(chart, 'ArrowLeft');
    press(chart, 'ArrowLeft');
    press(chart, 'ArrowRight');
    await waitFor(() => expect(crosshair(surface)).toStrictEqual([LAST, LAST - 1, LAST]));
  });

  test('the pointed candle stays the same when the previous page is prepended', async () => {
    const { chart, surface, harness } = await open({ runDays: 100 });
    press(chart, 'ArrowLeft');
    press(chart, 'ArrowLeft');
    await waitFor(() => expect(crosshair(surface).at(-1)).toBe(PAGE - 2));
    act(() => surface.emitVisibleRange({ from: 5, to: 300 }));
    await waitFor(() => expect(harness.candleCalls()).toHaveLength(2));
    await waitFor(() => expect(crosshair(surface).at(-1)).toBe(2 * PAGE - 2));
    press(chart, 'ArrowRight');
    await waitFor(() => expect(crosshair(surface).at(-1)).toBe(2 * PAGE - 1));
  });

  test('Home goes to the first candle and brings the chart to it when it is out of view', async () => {
    const { chart, surface } = await open();
    act(() => surface.emitVisibleRange({ from: 800, to: LAST }));
    press(chart, 'Home');
    await waitFor(() => expect(crosshair(surface).at(-1)).toBe(0));
    expect(surface.callsOf('centerOn').at(-1)).toStrictEqual([FIXTURE_FROM / 1_000]);
    press(chart, 'End');
    await waitFor(() => expect(crosshair(surface).at(-1)).toBe(LAST));
  });

  test('Esc clears the crosshair and the announcement', async () => {
    const { chart, surface } = await open();
    press(chart, 'ArrowLeft');
    await waitFor(() => expect(announcer().textContent).not.toBe(''));
    press(chart, 'Escape');
    await waitFor(() => expect(crosshair(surface).at(-1)).toBeNull());
    await waitFor(() => expect(announcer().textContent).toBe(''));
  });

  test('plus and minus zoom, and an arrow does not scroll the page', async () => {
    const { chart, surface } = await open();
    press(chart, '+');
    press(chart, '-');
    expect(surface.callsOf('zoom')).toStrictEqual([[1], [-1]]);
    const notPrevented = fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(notPrevented).toBe(false);
    expect(fireEvent.keyDown(chart, { key: 'Tab' })).toBe(true);
  });
});

describe('Shift com seta e Enter', () => {
  test('Shift+arrow jumps from buy to sell in time order and the speech names the event', async () => {
    const { chart, surface } = await open();
    press(chart, 'ArrowRight', true);
    await waitFor(() => expect(crosshair(surface).at(-1)).toBe(FIRST_BUY));
    await waitFor(() => expect(announcer().textContent).toEndWith('; compra'));
    press(chart, 'ArrowRight', true);
    await waitFor(() => expect(crosshair(surface).at(-1)).toBe(FIRST_SELL));
    await waitFor(() => expect(announcer().textContent).toEndWith('; venda'));
    press(chart, 'ArrowLeft', true);
    await waitFor(() => expect(crosshair(surface).at(-1)).toBe(FIRST_BUY));
  });

  test('Enter on a candle with an operation selects it in the URL', async () => {
    const { chart, harness } = await open();
    press(chart, 'ArrowRight', true);
    press(chart, 'Enter');
    await waitFor(() => expect(harness.router.state.location.search).toContain('operacao=p1'));
  });
});

describe('anúncio com espera', () => {
  test('the candle is spoken only after a pause, once for a burst of keys', async () => {
    const { chart } = await open();
    press(chart, 'Home');
    expect(announcer().textContent).toBe('');
    await waitFor(() => expect(announcer().textContent).toBe(firstCandleSpeech()), {
      timeout: 2_000,
    });
    expect(announcer().getAttribute('role')).toBe('status');
    press(chart, 'ArrowRight');
    press(chart, 'ArrowRight');
    press(chart, 'ArrowRight');
    expect(announcer().textContent).toBe(firstCandleSpeech());
    await waitFor(() => expect(announcer().textContent).toContain('variação'), { timeout: 2_000 });
  });

  test('the legend follows the pointed candle too', async () => {
    const { chart } = await open();
    press(chart, 'Home');
    expect(await screen.findByText('BNB/USDT · 1h · 31/03/2026 21:00')).toBeDefined();
  });
});

describe('descrição textual com a previsão', () => {
  const decisionAt = FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS;

  function live(options: CandleCardOptions = {}): Promise<{ readonly harness: CandleCardHarness }> {
    setSystemTime(new Date(decisionAt - 15 * 60_000));
    return open({
      kind: 'live_paper',
      respondProjections: () => dataResponse(buildProjectionsResponse()),
      ...options,
    });
  }

  test('the live caption carries the forecast sentence with the stance, strength, time and band', async () => {
    await live();
    const caption = document.querySelector('figcaption');
    await waitFor(() =>
      expect(caption?.textContent).toContain(
        'Previsão: tende a comprar (fraco) até 05:00, faixa de 12,778 a 13,032.',
      ),
    );
  });

  test('without a trend the caption says why, and on another candle it says to change back', async () => {
    const unavailable = {
      status: 'unavailable',
      reason: 'neutral',
      message: 'O placar está em 0: nenhuma regra puxa para um lado.',
    };
    await live({
      respondProjections: () => dataResponse(buildProjectionsResponse({ current: unavailable })),
    });
    const caption = document.querySelector('figcaption');
    await waitFor(() =>
      expect(caption?.textContent).toContain(
        'Sem previsão agora: O placar está em 0: nenhuma regra puxa para um lado.',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /^4h/ }));
    await waitFor(() =>
      expect(caption?.textContent).toContain(
        'Sem previsão agora: A estratégia decide em velas de 1 h; troque para 1h para ver a previsão.',
      ),
    );
  });

  test('a backtest and a hidden forecast layer add no sentence', async () => {
    const { chart } = await open();
    expect(
      within(chart.closest('figure') ?? document.body).queryByText(/Previsão: tende/),
    ).toBeNull();
    cleanup();
    await live();
    fireEvent.click(screen.getByRole('button', { name: 'Previsão' }));
    await waitFor(() =>
      expect(document.querySelector('figcaption')?.textContent).not.toContain('Previsão: tende'),
    );
  });
});
