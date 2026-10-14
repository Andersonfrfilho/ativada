// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

const RUN_TIMEOUT_MILLISECONDS = 90_000;

// Cria um backtest pela tela (candles diários do seed, os últimos 180 dias) e espera o resultado: a API roda de verdade.
export async function runBacktestThroughTheScreen(page: Page, slippage: string): Promise<string> {
  await page.getByRole('link', { name: 'Backtests' }).click();
  await expect(page.getByRole('heading', { name: 'Backtests', level: 1 })).toBeVisible();
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
  await expectTradesOnTheChart(page);
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

// O cartão "Preço e operações" do backtest real: resumo, controles, gráfico e tabela. As setas dependem do que a estratégia
// decide nos candles do seed; havendo setas, clicar numa seleciona a linha da tabela, e não havendo, o cartão diz que não há.
async function expectTradesOnTheChart(page: Page): Promise<void> {
  const card = page.getByRole('region', { name: 'Preço e operações', exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByRole('region', { name: 'Resumo das operações' })).toBeVisible();
  await expect(card.getByRole('group', { name: 'Período do gráfico' })).toBeVisible();
  await expect(card.getByRole('group', { name: 'Preço e operações' })).toBeVisible();
  const table = card.getByRole('region', { name: 'Tabela de operações' });
  await expect(table).toBeVisible();
  const arrows = card.locator('[data-chart-item]');
  if ((await arrows.count()) === 0) {
    await expect(table).toContainText('Nenhuma operação no período.');
    return;
  }
  await arrows.first().click();
  await expect(table.locator('tr[aria-current="true"]')).toHaveCount(1);
  await expect(page).toHaveURL(/[?&]operacao=/);
}
