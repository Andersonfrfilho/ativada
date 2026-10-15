// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Locator, type Page } from '@playwright/test';

import { countChangedPixels, readCanvasStats, takeCanvasSnapshot } from './canvas.js';
import { sendKline, type Control } from './control.js';

const CARD = { name: 'Preço e operações', exact: true } as const;
const MINIMUM_DRAWN_PIXELS = 2_000;
const MINIMUM_COLORS = 6;
const ANNOUNCEMENT_PAUSE_MILLISECONDS = 600;
const FORMING = {
  first: { open: '61490.00', high: '61580.00', low: '61470.00', close: '61560.00' },
  second: { open: '61490.00', high: '61710.00', low: '61470.00', close: '61700.00' },
} as const;

type ProjectionCurrent = { readonly label: string; readonly message: string };

function readString(value: unknown, ...path: readonly string[]): string | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = Reflect.get(cursor, key);
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

// A resposta de `GET /v1/runs/:id/projections` que a tela recebeu: o texto exibido tem de ser o do servidor, palavra por palavra.
export async function waitForProjections(page: Page): Promise<unknown> {
  const response = await page.waitForResponse(
    (candidate) => /\/v1\/runs\/[0-9a-f-]{36}\/projections/.test(candidate.url()) && candidate.ok(),
  );
  const body: unknown = await response.json();
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'data') : undefined;
}

export function chartOf(page: Page): Locator {
  return page.getByRole('region', CARD).locator('[aria-roledescription="gráfico de velas"]');
}

async function openLiveRunDetail(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Visão geral' })
    .click();
  await page
    .getByRole('region', { name: 'Saldo da simulação' })
    .getByRole('link', { name: 'Ver compras e vendas no gráfico' })
    .click();
  await expect(page).toHaveURL(/\/backtests\/[0-9a-f-]{36}$/);
}

// Pela Visão geral até o detalhe da simulação ao vivo; devolve a previsão que o servidor entregou à tela.
export async function openLiveRunWithProjections(page: Page): Promise<unknown> {
  const projections = waitForProjections(page);
  await openLiveRunDetail(page);
  return projections;
}

export async function expectCanvasDrawn(page: Page): Promise<void> {
  const chart = chartOf(page);
  await expect(chart.locator('canvas').first()).toBeVisible();
  await expect
    .poll(async () => (await readCanvasStats(chart)).drawn, { timeout: 20_000 })
    .toBeGreaterThan(MINIMUM_DRAWN_PIXELS);
  expect((await readCanvasStats(chart)).colors).toBeGreaterThan(MINIMUM_COLORS);
}

// Ligar ou desligar a camada tem de mudar pixels do canvas: é a prova de que a camada desenha de verdade.
export async function toggleLayerAndCountPixels(page: Page, layer: string): Promise<number> {
  const chart = chartOf(page);
  const button = page.getByRole('region', CARD).getByRole('button', { name: layer });
  await takeCanvasSnapshot(chart, `antes:${layer}`);
  const wasOn = (await button.getAttribute('aria-pressed')) === 'true';
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', wasOn ? 'false' : 'true');
  let changed = 0;
  await expect
    .poll(async () => (changed = await countChangedPixels(chart, `antes:${layer}`)), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  return changed;
}

// Teclado: a seta anda uma vela e o anúncio (`aria-live`) fala a vela nova; outra seta muda a fala.
export async function expectKeyboardAnnouncements(page: Page): Promise<void> {
  const card = page.getByRole('region', CARD);
  const chart = chartOf(page);
  const announcement = card.locator('p[aria-live="polite"]');
  await chart.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(announcement).toContainText(/abertura .*fechamento/);
  const first = await announcement.innerText();
  await page.waitForTimeout(ANNOUNCEMENT_PAUSE_MILLISECONDS);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => announcement.innerText()).not.toBe(first);
  await page.keyboard.press('Escape');
  await expect(announcement).toHaveText('');
  // Sem a cruz (nem do teclado nem do mouse) a legenda volta à vela em formação ou, sem ela, à última fechada.
  await expect(card.locator('dt[aria-label="Fechamento"] + dd')).toContainText('61.');
}

// A Binance falsa manda a vela aberta; o ticker de verdade a agrega, a API a entrega pelo WebSocket e a vela em formação muda.
export async function expectFormingCandleFollowsTheStream(
  page: Page,
  control: Control,
): Promise<void> {
  const card = page.getByRole('region', CARD);
  const chart = chartOf(page);
  const close = card.locator('dt[aria-label="Fechamento"] + dd');
  await expect(async () => {
    await sendKline(control, FORMING.first);
    await expect(close).toContainText('61.560', { timeout: 2_500 });
  }).toPass({ timeout: 30_000 });
  await expect(card.getByText('em formação', { exact: true })).toBeVisible();
  await takeCanvasSnapshot(chart, 'vela-em-formacao');
  await expect(async () => {
    await sendKline(control, FORMING.second);
    await expect(close).toContainText('61.700', { timeout: 2_500 });
  }).toPass({ timeout: 30_000 });
  expect(await countChangedPixels(chart, 'vela-em-formacao')).toBeGreaterThan(0);
}

// "Próxima vela de perto" e os dois cartões mostram o texto do servidor, sem refazer conta.
export async function expectServerTexts(page: Page, data: unknown): Promise<void> {
  const current: ProjectionCurrent = {
    label: readString(data, 'current', 'label') ?? '',
    message: readString(data, 'current', 'message') ?? '',
  };
  const panel = page.getByRole('complementary', { name: 'Próxima vela de perto' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(current.message);
  if (current.label.length > 0) await expect(panel).toContainText(current.label);
  await expect(panel).toContainText('Tendência, não promessa.');
  const history = page.getByRole('region', { name: 'Histórico de acertos' });
  await expect(history).toContainText(readString(data, 'summary', 'message') ?? 'sem frase');
  await expect(history).toContainText(readString(data, 'summary', 'verdictMessage') ?? 'sem frase');
  await expect(page.getByRole('region', { name: 'De onde vem a previsão' })).toBeVisible();
}

// Depois do Esc a legenda tem de voltar à vela em formação (e não ficar presa na vela que o teclado apontou).
export async function expectLegendOnTheFormingCandle(page: Page, control: Control): Promise<void> {
  const card = page.getByRole('region', CARD);
  await expect(async () => {
    await sendKline(control, FORMING.second);
    await expect(card.getByText('em formação', { exact: true })).toBeVisible({ timeout: 2_500 });
    await expect(card.locator('dt[aria-label="Fechamento"] + dd')).toContainText('61.700', {
      timeout: 2_500,
    });
  }).toPass({ timeout: 30_000 });
}

// Deixa as camadas do desenho ligadas e, se o harness pediu (`PANEL_E2E_CAPTURE_PATH`), grava a captura do cartão do gráfico.
export async function captureTheChartCard(
  page: Page,
  control: Control,
  path: string | undefined,
): Promise<void> {
  if (path === undefined) return;
  const card = page.getByRole('region', CARD);
  for (const layer of ['Previsão', 'Linhas da estratégia', 'Stop e alvo']) {
    const button = card.getByRole('button', { name: layer });
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  }
  await expect(async () => {
    await sendKline(control, FORMING.second);
    await expect(card.getByText('em formação', { exact: true })).toBeVisible({ timeout: 2_500 });
  }).toPass({ timeout: 30_000 });
  await page.mouse.move(0, 0);
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path });
}
