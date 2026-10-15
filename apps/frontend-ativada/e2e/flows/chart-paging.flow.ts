// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Locator, type Page, type Request } from '@playwright/test';

import { chartOf, expectCanvasDrawn } from './chart-live.flow.js';
import { createLongRun, type Control } from './control.js';

const CANDLES_PATH = '/v1/markets/candles';
const FULL_HISTORY_PAGES = 5;
const PAGE_SPAN_MILLISECONDS = 1_000 * 3_600_000;
const MAX_SWEEPS_TO_LOAD_HISTORY = 80;
const MOVES_PER_SWEEP = 90;
const MEASURED_SWEEPS = 8;
const SWEEP_SHARE_OF_WIDTH = 0.9;
const MILLISECONDS_PER_SECOND = 1000;
const MEDIAN_PERCENTILE = 50;
const SLOW_FRAME_PERCENTILE = 5;

export type CandlePage = { readonly from: number; readonly to: number };

type DragWindow = { readonly start: number; readonly end: number };

export type FrameReport = {
  readonly label: string;
  // Quadros contados só enquanto o botão do mouse estava apertado (o arrasto), não o tempo parado entre varreduras.
  readonly frames: number;
  readonly medianFps: number;
  readonly p5Fps: number;
  readonly worstFps: number;
};

type FrameRecorder = { readonly frames: number[]; readonly state: { isRunning: boolean } };

declare global {
  interface Window {
    __frameRecorder?: FrameRecorder;
  }
}

function readPage(request: Request): CandlePage | undefined {
  const url = new URL(request.url());
  if (!url.pathname.endsWith(CANDLES_PATH) || url.searchParams.get('timeframe') !== '1h') {
    return undefined;
  }
  const page = {
    from: Number(url.searchParams.get('from')),
    to: Number(url.searchParams.get('to')),
  };
  return page.to - page.from === PAGE_SPAN_MILLISECONDS ? page : undefined;
}

// Guarda os pedidos de páginas de 1.000 velas de 1 h, na ordem em que a tela os fez.
export function recordCandlePages(page: Page): CandlePage[] {
  const pages: CandlePage[] = [];
  page.on('request', (request) => {
    const candlePage = readPage(request);
    if (candlePage !== undefined) pages.push(candlePage);
  });
  return pages;
}

async function pageNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

// Uma varredura apertando o botão: devolve o intervalo (relógio da página) em que o arrasto aconteceu.
async function sweep(page: Page, chart: Locator, direction: 1 | -1): Promise<DragWindow> {
  // O gráfico fica abaixo da dobra: o mouse só alcança o que está dentro da janela.
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  if (box === null) throw new Error('o gráfico não tem caixa');
  const reach = box.width * SWEEP_SHARE_OF_WIDTH;
  const startX = box.x + (box.width - reach) / 2 + (direction === 1 ? 0 : reach);
  const y = box.y + box.height / 3;
  await page.mouse.move(startX, y);
  const start = await pageNow(page);
  await page.mouse.down();
  await page.mouse.move(startX + direction * reach, y, { steps: MOVES_PER_SWEEP });
  await page.mouse.up();
  return { start, end: await pageNow(page) };
}

async function startFrameRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frames: number[] = [];
    const state = { isRunning: true };
    const tick = (time: number): void => {
      frames.push(time);
      if (state.isRunning) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__frameRecorder = { frames, state };
  });
}

async function stopFrameRecorder(page: Page): Promise<readonly number[]> {
  return page.evaluate(() => {
    const recorder = window.__frameRecorder;
    if (recorder === undefined) return [];
    recorder.state.isRunning = false;
    return recorder.frames;
  });
}

function percentile(sorted: readonly number[], share: number): number {
  const index = Math.min(sorted.length - 1, Math.floor((share / 100) * sorted.length));
  return sorted[index] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

// Quadros por segundo de cada intervalo entre dois quadros DURANTE o arrasto; o "p5" é o quadro lento (5% dos quadros foram
// piores que ele) e o "pior" é o intervalo mais longo.
export function summarizeFrames(
  label: string,
  times: readonly number[],
  windows: readonly DragWindow[],
): FrameReport {
  const rates = times
    .slice(1)
    .map((time, index) => ({
      time,
      rate: MILLISECONDS_PER_SECOND / Math.max(time - (times[index] ?? time), 1),
    }))
    .filter(({ time }) => windows.some((window) => time >= window.start && time <= window.end))
    .map(({ rate }) => rate)
    .sort((left, right) => left - right);
  return {
    label,
    frames: rates.length,
    medianFps: round(percentile(rates, MEDIAN_PERCENTILE)),
    p5Fps: round(percentile(rates, SLOW_FRAME_PERCENTILE)),
    worstFps: round(rates[0] ?? 0),
  };
}

async function measureSweeps(
  page: Page,
  label: string,
  rules: {
    readonly direction: (round: number) => 1 | -1;
    readonly isDone: (round: number) => boolean;
  },
): Promise<FrameReport> {
  const chart = chartOf(page);
  const windows: DragWindow[] = [];
  await startFrameRecorder(page);
  for (let round = 0; !rules.isDone(round); round += 1) {
    windows.push(await sweep(page, chart, rules.direction(round)));
  }
  return summarizeFrames(label, await stopFrameRecorder(page), windows);
}

// Arrasta para trás até a tela ter pedido as cinco páginas de 1.000 velas (o período inteiro, 5.000 velas).
export async function dragBackThroughTheWholePeriod(
  page: Page,
  pages: readonly CandlePage[],
): Promise<FrameReport> {
  return measureSweeps(page, 'arrasto até carregar 5.000 velas (janela de ~150 velas)', {
    direction: () => 1,
    isDone: (round) => pages.length >= FULL_HISTORY_PAGES || round >= MAX_SWEEPS_TO_LOAD_HISTORY,
  });
}

// Com as 5.000 velas carregadas: varreduras de ida e volta, na janela normal e com o gráfico ajustado a todas as velas.
export async function measureDragWithLoadedHistory(page: Page): Promise<readonly FrameReport[]> {
  const rules = {
    direction: (round: number): 1 | -1 => (round % 2 === 0 ? -1 : 1),
    isDone: (round: number): boolean => round >= MEASURED_SWEEPS,
  };
  const narrow = await measureSweeps(page, '5.000 velas carregadas, janela de ~150 velas', rules);
  await page
    .getByRole('region', { name: 'Preço e operações', exact: true })
    .getByRole('button', { name: 'Ajustar' })
    .click();
  const wide = await measureSweeps(page, '5.000 velas carregadas, todas à vista (Ajustar)', rules);
  return [narrow, wide];
}

// Pelos Backtests até o gráfico do backtest de 1 h com 5.000 velas, criado pelo servidor de controle.
export async function openLongBacktest(page: Page, control: Control): Promise<void> {
  const runId = await createLongRun(control);
  await page.goto(`/backtests/${runId}`);
  await expect(page.getByRole('region', { name: 'Preço e operações', exact: true })).toBeVisible();
  await expectCanvasDrawn(page);
}
