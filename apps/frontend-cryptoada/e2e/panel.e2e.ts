// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { readE2eEnvironment } from './e2e-environment.js';
import { receiveLiveAlertsWithoutReloading } from './flows/alerts.flow.js';
import { registerAPurchaseAndWatchThePrice } from './flows/assets.flow.js';
import {
  compareTheTwoBacktests,
  expectBacktestResult,
  runBacktestThroughTheScreen,
} from './flows/backtest.flow.js';
import { declareGoalRankAndSimulate, openPlanOfTheFirstGoal } from './flows/goals.flow.js';
import { dropTheSocketAndComeBack } from './flows/live.flow.js';
import { alertOnTheTargetAndLetTheTickFireIt } from './flows/plan-alert.flow.js';
import { deleteTheCopy, editStrategyIntoANewVersion } from './flows/strategy.flow.js';

const environment = readE2eEnvironment();
const NOTICE = 'Simulação com dinheiro fictício. Não é recomendação de investimento.';
const REFRESH_COOKIE = '__Host-cryptoada_refresh';
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./;
const DIST_INDEX = new URL('../dist/index.html', import.meta.url);
const consoleProblems: string[] = [];
let page: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  page.on('console', (message) => {
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

test('rota protegida sem sessão leva ao login, com o aviso de simulação', async () => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expectNotice();
  await expect(page.getByRole('button', { name: 'Entrar com Keycloak' })).toBeVisible();
});

test('login pelo Keycloak com PKCE volta ao painel e guarda o refresh só em cookie HttpOnly', async () => {
  await page.getByRole('button', { name: 'Entrar com Keycloak' }).click();
  await page.locator('#username').fill(environment.username);
  await page.locator('#password').fill(environment.password);
  await page.locator('#kc-login').click();
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
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

test('exportar meus dados baixa o arquivo da API com o e-mail do usuário', async () => {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar meus dados' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^cryptoada-export-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  expect(await readFile(path, 'utf8')).toContain(environment.email);
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
  await editStrategyIntoANewVersion(page);
  await deleteTheCopy(page);
});

test('alertas: sinal e alerta de preço chegam pelo WebSocket e aparecem sem recarregar', async () => {
  await receiveLiveAlertsWithoutReloading(page, {
    request: page.request,
    url: environment.controlUrl,
  });
});

test('metas: declarar a meta, ver o ranking estratégia x moeda e simular, com o cartão de meta ativa no painel', async () => {
  await declareGoalRankAndSimulate(page);
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
  expect(manifestBody).toMatchObject({ name: 'CryptoAdA' });
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

test('apagar a conta pede o e-mail, encerra a sessão e leva ao login', async () => {
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
});
