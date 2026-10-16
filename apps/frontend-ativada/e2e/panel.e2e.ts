// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { readE2eEnvironment } from './e2e-environment.js';
import { receiveLiveAlertsWithoutReloading } from './flows/alerts.flow.js';
import {
  createASimulationWithTheAnalyst,
  watchTheAnalystCardChange,
} from './flows/analyst.flow.js';
import { registerAPurchaseAndWatchThePrice } from './flows/assets.flow.js';
import {
  compareTheTwoBacktests,
  expectBacktestResult,
  runBacktestThroughTheScreen,
} from './flows/backtest.flow.js';
import { declareGoalRankAndSimulate, openPlanOfTheFirstGoal } from './flows/goals.flow.js';
import {
  dragBackThroughTheWholePeriod,
  measureDragWithLoadedHistory,
  openLongBacktest,
  recordCandlePages,
} from './flows/chart-paging.flow.js';
import {
  captureTheChartCard,
  expectCanvasDrawn,
  expectFormingCandleFollowsTheStream,
  expectLegendOnTheFormingCandle,
  expectKeyboardAnnouncements,
  expectServerTexts,
  openLiveRunWithProjections,
  toggleLayerAndCountPixels,
} from './flows/chart-live.flow.js';
import { dropTheSocketAndComeBack } from './flows/live.flow.js';
import { watchTheTrackingGetANewDecision } from './flows/live-tracking.flow.js';
import { watchLiveFillsAppearOnTheChart } from './flows/live-trades.flow.js';
import { alertOnTheTargetAndLetTheTickFireIt } from './flows/plan-alert.flow.js';
import { watchTheStalledBannerComeAndGo } from './flows/stall.flow.js';
import { deleteTheCopy, editStrategyIntoANewVersion } from './flows/strategy.flow.js';

const environment = readE2eEnvironment();
const NOTICE = 'Simulação com dinheiro fictício. Não é recomendação de investimento.';
const REFRESH_COOKIE = '__Host-ativada_refresh';
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./;
const DIST_INDEX = new URL('../dist/index.html', import.meta.url);
const ROUND_PAUSE_MILLISECONDS = 6_000;
const RATE_WINDOW_PAUSE_MILLISECONDS = 50_000;
const consoleProblems: string[] = [];
const cspViolations: string[] = [];
let page: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) cspViolations.push(message.text());
    const isFailedRequest = message.text().startsWith('Failed to load resource');
    if (message.type() === 'error' && !isFailedRequest) consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => consoleProblems.push(error.message));
});

test.afterAll(async () => {
  await page.context().close();
});

async function expectNotice(): Promise<void> {
  await expect(page.getByRole('note', { name: 'Aviso de simulação' })).toContainText(NOTICE);
}

async function signInThroughKeycloak(): Promise<void> {
  await page.getByRole('button', { name: 'Entrar com Keycloak' }).click();
  await page.locator('#username').fill(environment.username);
  await page.locator('#password').fill(environment.password);
  await page.locator('#kc-login').click();
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
}

test('rota protegida sem sessão leva ao login, com o aviso de simulação', async () => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expectNotice();
  await expect(page.getByRole('button', { name: 'Entrar com Keycloak' })).toBeVisible();
});

test('login pelo Keycloak com PKCE volta ao painel e guarda o refresh só em cookie HttpOnly', async () => {
  await signInThroughKeycloak();
  await expectNotice();
  const cookies = await page.context().cookies();
  const refresh = cookies.find((cookie) => cookie.name === REFRESH_COOKIE);
  expect(refresh?.httpOnly).toBe(true);
  expect(refresh?.secure).toBe(true);
  const stored = await page.evaluate(() =>
    JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]),
  );
  expect(stored).not.toMatch(JWT_PATTERN);
  expect(stored).not.toContain(refresh?.value ?? 'ausente');
});

test('visão geral mostra saldo, estado, sinais, moedas e o crédito do Fear & Greed', async () => {
  const balance = page.getByRole('region', { name: 'Saldo da simulação' });
  await expect(balance).toContainText(environment.expected.equity);
  await expect(balance).toContainText(environment.expected.initial);
  await expect(balance).toContainText(environment.expected.resultChange);
  await expect(balance).toContainText(environment.expected.benchmarkChange);
  await expect(balance).toContainText('Rodando');
  const signals = page.getByRole('list', { name: 'Últimos sinais' });
  await expect(signals).toContainText(environment.expected.firstSignal);
  await expect(signals).toContainText(environment.expected.secondSignal);
  const bitcoin = page.getByRole('article', { name: 'BTC/USDT' });
  await expect(bitcoin).toContainText(environment.expected.bitcoinPrice);
  await expect(bitcoin).toContainText(environment.expected.bitcoinChange);
  await expect(page.getByRole('article', { name: 'ETH/USDT' })).toBeVisible();
  const credit = page.getByRole('link', { name: 'Fear & Greed Index por alternative.me' });
  await expect(credit).toHaveAttribute(
    'href',
    'https://alternative.me/crypto/fear-and-greed-index/',
  );
  await expect(credit).toHaveAttribute('rel', /noopener/);
  await expect(credit).toHaveAttribute('rel', /noreferrer/);
});

test('recarregar a página mantém a sessão pelo cookie', async () => {
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
});

test('conta: preferências persistem no servidor e o tema no navegador', async () => {
  await page.getByRole('link', { name: 'Conta' }).click();
  await expect(page.getByText(environment.email)).toBeVisible();
  const alerts = page.getByRole('checkbox', { name: 'Receber alertas no Telegram' });
  await expect(alerts).toBeChecked();
  await alerts.uncheck();
  await expect(alerts).not.toBeChecked();
  await page.getByRole('combobox', { name: 'Tema' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Receber alertas no Telegram' }),
  ).not.toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('combobox', { name: 'Tema' }).selectOption('system');
});

async function linkTelegram(): Promise<void> {
  await page.getByRole('button', { name: 'Gerar código de vínculo' }).click();
  const code = (await page.locator('output').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-7]{10}$/);
  const response = await page.request.post(`${environment.apiUrl}/v1/telegram/webhook`, {
    headers: { 'X-Telegram-Bot-Api-Secret-Token': environment.telegramSecret },
    data: {
      update_id: 1,
      message: {
        chat: { id: Number(environment.telegramChatId), type: 'private' },
        text: `/start ${code}`,
      },
    },
  });
  expect(response.status()).toBe(200);
  await page.getByRole('button', { name: 'Já enviei o código' }).click();
}

test('Telegram: gera o código, vincula pelo webhook real e desvincula', async () => {
  await expect(page.getByText('Telegram não vinculado')).toBeVisible();
  await linkTelegram();
  await expect(page.getByText('Telegram vinculado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Desvincular Telegram' }).click();
  await expect(page.getByText('Telegram não vinculado')).toBeVisible();
});

test('backtest: criar pela tela, acompanhar na fila e ver o resultado de uma execução real', async () => {
  await runBacktestThroughTheScreen(page, '0.0005');
  await expectBacktestResult(page);
});

test('comparar duas execuções lado a lado, com comprar e segurar e a explicação dos custos', async () => {
  await runBacktestThroughTheScreen(page, '0.002');
  await compareTheTwoBacktests(page);
});

test('estratégias: duplicar o exemplo, editar um parâmetro gera a versão 2 e apagar a cópia', async () => {
  // `PANEL_E2E_STRATEGY_REPEAT=10` repete o ciclo na mesma sessão para provar que não é corrida (padrão: uma vez).
  for (let round = 0; round < environment.strategyRepeat; round += 1) {
    await editStrategyIntoANewVersion(page);
    await deleteTheCopy(page);
    // O limite de 120 requisições por minuto vale no E2E: nas repetições, espaça as rodadas.
    if (environment.strategyRepeat > 1) await page.waitForTimeout(ROUND_PAUSE_MILLISECONDS);
  }
});

test('alertas: sinal e alerta de preço chegam pelo WebSocket e aparecem sem recarregar', async () => {
  await receiveLiveAlertsWithoutReloading(page, {
    request: page.request,
    url: environment.controlUrl,
  });
});

test('simulação ao vivo: pela Visão geral até o gráfico, e a compra e a venda gravadas aparecem como setas sem recarregar', async () => {
  // Cada página da simulação ao vivo faz mais consultas (spec 008): sem a pausa o limite de 120 por minuto devolve 429.
  await page.waitForTimeout(RATE_WINDOW_PAUSE_MILLISECONDS);
  await watchLiveFillsAppearOnTheChart(page, {
    request: page.request,
    url: environment.controlUrl,
  });
});

test('gráfico de velas: canvas com pixels, teclado, vela em formação pela kline falsa, previsão e cartões do servidor, sem violação de CSP', async () => {
  await page.waitForTimeout(RATE_WINDOW_PAUSE_MILLISECONDS);
  const control = { request: page.request, url: environment.controlUrl };
  const projections = await openLiveRunWithProjections(page);
  await expectCanvasDrawn(page);
  await expectServerTexts(page, projections);
  await expectFormingCandleFollowsTheStream(page, control);
  await expectKeyboardAnnouncements(page);
  await expectLegendOnTheFormingCandle(page, control);
  for (const layer of ['Previsão', 'Stop e alvo', 'Linhas da estratégia']) {
    console.log(`camada ${layer}: ${await toggleLayerAndCountPixels(page, layer)} pixels mudaram`);
  }
  await captureTheChartCard(page, control, environment.capturePath);
  expect(cspViolations).toEqual([]);
});

test('acompanhamento: uma decisão de esperar gravada pelo servidor de controle traz a linha "Esperou" e o saldo novo, sem recarregar', async () => {
  // As rodadas anteriores esgotam o limite de 120 requisições por minuto (um 429 deixaria o saldo velho na tela).
  await page.waitForTimeout(RATE_WINDOW_PAUSE_MILLISECONDS);
  await watchTheTrackingGetANewDecision(page, {
    request: page.request,
    url: environment.controlUrl,
  });
});

test('gráfico de velas: com a decisão de esperar a camada "Esperou" desenha e a previsão fica neutra', async () => {
  await page.waitForTimeout(RATE_WINDOW_PAUSE_MILLISECONDS);
  const control = { request: page.request, url: environment.controlUrl };
  const projections = await openLiveRunWithProjections(page);
  await expectCanvasDrawn(page);
  // Sem preço fresco a tela diz "o preço parou de chegar" no lugar da previsão (decisão de design); a vela aberta o refaz.
  await expectLegendOnTheFormingCandle(page, control);
  await expectServerTexts(page, projections);
  console.log(`camada Esperou: ${await toggleLayerAndCountPixels(page, 'Esperou')} pixels mudaram`);
  expect(cspViolations).toEqual([]);
});

test('gráfico de velas: arrastar pede a página anterior de velas e mede os quadros por segundo com 5.000 velas', async () => {
  await page.waitForTimeout(RATE_WINDOW_PAUSE_MILLISECONDS);
  const pages = recordCandlePages(page);
  await openLongBacktest(page, { request: page.request, url: environment.controlUrl });
  expect(pages).toHaveLength(1);
  const first = pages[0];
  const loading = await dragBackThroughTheWholePeriod(page, pages);
  expect(pages.length).toBeGreaterThanOrEqual(2);
  expect(pages[1]?.to).toBe(first?.from);
  const loaded = await measureDragWithLoadedHistory(page);
  console.log(`FPS ${JSON.stringify(loading)}`);
  loaded.forEach((report) => console.log(`FPS ${JSON.stringify(report)} páginas=${pages.length}`));
  await expectCanvasDrawn(page);
  expect(cspViolations).toEqual([]);
});

test('metas: declarar a meta, ver o ranking estratégia x moeda e simular, com o cartão de meta ativa no painel', async () => {
  await declareGoalRankAndSimulate(page);
});

test('analista de risco: criar a simulação com o analista pela tela (vela de 15 min travada, modo sombra)', async () => {
  // As rodadas anteriores esgotam o limite de 120 requisições por minuto.
  await page.waitForTimeout(RATE_WINDOW_PAUSE_MILLISECONDS);
  await createASimulationWithTheAnalyst(page);
});

test('analista de risco: a decisão chega pelo NOTIFY do servidor de controle e o cartão muda sem recarregar', async () => {
  await page.waitForTimeout(RATE_WINDOW_PAUSE_MILLISECONDS);
  await watchTheAnalystCardChange(page, { request: page.request, url: environment.controlUrl });
});

test('simulação parada: a faixa aparece pelo NOTIFY do servidor de controle e some quando a simulação volta, sem recarregar', async () => {
  // As rodadas anteriores esgotam o limite de 120 requisições por minuto: um 429 na releitura deixaria a faixa velha na tela.
  await page.waitForTimeout(RATE_WINDOW_PAUSE_MILLISECONDS);
  await watchTheStalledBannerComeAndGo(page, {
    request: page.request,
    url: environment.controlUrl,
  });
});

test('plano: níveis e gráfico; "Avisar no plano" cria o alerta e o tick o dispara sem recarregar', async () => {
  await openPlanOfTheFirstGoal(page);
  await alertOnTheTargetAndLetTheTickFireIt(page, {
    request: page.request,
    url: environment.controlUrl,
  });
});

test('ativos: registrar a compra mostra valor, regra, alvo e stop, e o preço muda sem recarregar', async () => {
  await registerAPurchaseAndWatchThePrice(page, {
    request: page.request,
    url: environment.controlUrl,
  });
});

test('tempo real: derrubar o socket mostra "sem dados" e a volta corrige a tela', async () => {
  await dropTheSocketAndComeBack(page, { request: page.request, url: environment.controlUrl });
});

test('PWA: manifesto válido, service worker ativo e nada de /v1 em cache; CSP sem unsafe-inline', async () => {
  const manifest = await page.request.get('/manifest.webmanifest');
  const manifestBody: unknown = await manifest.json();
  expect(manifestBody).toMatchObject({ name: 'AtivAdA' });
  const cachedUrls = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => request.url);
  });
  expect(cachedUrls.some((url) => new URL(url).pathname.startsWith('/v1'))).toBe(false);
  const html = await readFile(DIST_INDEX, 'utf8');
  expect(html).toContain('Content-Security-Policy');
  expect(html).not.toContain('unsafe-inline');
  expect(html).not.toContain('unsafe-eval');
  const served = (await page.request.get('/')).headers();
  expect(served['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(served['x-frame-options']).toBe('DENY');
  expect(served['strict-transport-security']).toContain('max-age=');
  expect(served['permissions-policy']).toContain('camera=()');
});

test('celular: sem rolagem horizontal em nenhuma tela do painel', async () => {
  await page.setViewportSize({ width: 375, height: 812 });
  const navigation = page.getByRole('navigation', { name: 'Principal' });
  for (const link of [
    'Visão geral',
    'Metas',
    'Ativos',
    'Backtests',
    'Estratégias',
    'Alertas',
    'Conta',
  ]) {
    await navigation.getByRole('link', { name: link }).click();
    await expect(navigation).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
});

// Depois do teste de tempo real de propósito: no Edge, a aba que intercepta o WebSocket trava depois do teste de um download.
test('exportar meus dados baixa o arquivo da API com o e-mail do usuário', async () => {
  await page.waitForTimeout(RATE_WINDOW_PAUSE_MILLISECONDS);
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Conta' })
    .click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meus dados' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^ativada-export-\d{4}-\d{2}-\d{2}\.ndjson$/);
  const path = await download.path();
  expect(await readFile(path, 'utf8')).toContain(environment.email);
});

test('apagar a conta pede o e-mail, encerra a sessão e leva ao login', async () => {
  // A confirmação de apagar vale por 5 minutos após o login e a suíte já passou disso: entra de novo antes.
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signInThroughKeycloak();
  await page.goto('/conta');
  const button = page.getByRole('button', { name: 'Apagar minha conta' });
  await expect(button).toBeDisabled();
  await page.getByLabel('Digite seu e-mail para confirmar').fill(environment.email);
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/login$/);
  await expectNotice();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === REFRESH_COOKIE)).toBe(false);
});

test('nenhum erro de console nem violação de CSP durante todo o fluxo', () => {
  expect(consoleProblems).toEqual([]);
  expect(cspViolations).toEqual([]);
});
