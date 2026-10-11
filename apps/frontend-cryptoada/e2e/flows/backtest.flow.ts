// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

const RUN_TIMEOUT_MILLISECONDS = 90_000;

// Cria um backtest pela tela (candles diários do seed, os últimos 180 dias) e espera o resultado: a API roda de verdade.
export async function runBacktestThroughTheScreen(page: Page, slippage: string): Promise<string> {
  await page.getByRole('link', { name: 'Backtests' }).click();
  await expect(page.getByRole('heading', { name: 'Backtests', level: 1 })).toBeVisible();
  // As versões da estratégia carregam depois da lista: enviar antes disso cai no "escolha uma estratégia" do formulário.
  await expect(page.getByRole('combobox', { name: 'Versão' })).toContainText('versão 1');
  await page.getByRole('combobox', { name: 'Timeframe' }).selectOption('1d');
  await page.getByLabel('Slippage').fill(slippage);
  await page.getByRole('button', { name: 'Rodar backtest' }).click();
  await expect(page).toHaveURL(/\/backtests\/[0-9a-f-]{36}$/);
  const runId = page.url().split('/').at(-1) ?? '';
  const result = page.getByRole('region', { name: 'Resultado' });
  await expect(result).toBeVisible({ timeout: RUN_TIMEOUT_MILLISECONDS });
  return runId;
}

export async function expectBacktestResult(page: Page): Promise<void> {
  const result = page.getByRole('region', { name: 'Resultado' });
  for (const label of ['Retorno total', 'Comprar e segurar', 'Maior queda', 'Taxas pagas']) {
    await expect(result).toContainText(label);
  }
  await expect(
    page.getByRole('img', { name: /Retorno acumulado\. Estratégia: .*Comprar e segurar: / }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Operações' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Custos incluídos' })).toContainText('0,10%');
}

export async function compareTheTwoBacktests(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Backtests' }).click();
  const boxes = page.getByRole('checkbox', { name: /^Comparar/ });
  await expect(boxes.nth(1)).toBeVisible();
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.getByRole('link', { name: 'Comparar as 2 selecionadas' }).click();
  const table = page.getByRole('table', { name: 'Comparação de execuções' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Comprar e segurar' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Como ler os custos' })).toContainText(
    'uma compra e uma venda',
  );
}
