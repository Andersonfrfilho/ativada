// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

const STRATEGY_NAME = 'Minha estratégia ao vivo';
const EVALUATION_TIMEOUT_MILLISECONDS = 60_000;

export async function openMainLink(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name }).click();
}

// Metas → ranking (calculado de verdade sobre os candles diários do banco) → simular → cartão de meta ativa no painel.
export async function declareGoalRankAndSimulate(page: Page): Promise<void> {
  await openMainLink(page, 'Metas');
  await expect(page.getByRole('heading', { name: 'Metas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Declarar meta' }).click();
  await expect(page).toHaveURL(/\/metas\/[0-9a-f-]+$/);
  const ranking = page.getByRole('list', { name: 'Ranking de estratégias por moeda' });
  await expect(ranking).toContainText(STRATEGY_NAME, { timeout: EVALUATION_TIMEOUT_MILLISECONDS });
  await expect(ranking).toContainText(/COMPRAR|SEGURAR|EVITAR/);
  await expect(page.getByRole('note', { name: 'Leia com cuidado' })).toContainText('histórico');
  const situations = page.getByRole('region', { name: 'Moedas: situação e próximo gatilho' });
  await expect(situations.getByRole('article', { name: 'BTC/USDT' })).toBeVisible();
  await page.getByRole('button', { name: `Simular esta meta com ${STRATEGY_NAME}` }).click();
  await expect(page).toHaveURL(/\/$/);
  const card = page.getByRole('region', { name: 'Meta ativa' });
  await expect(card).toContainText('alvo +3,00%');
  await expect(card).toContainText('perda máxima 5,00%');
}

export async function openPlanOfTheFirstGoal(page: Page): Promise<void> {
  await openMainLink(page, 'Metas');
  await page
    .getByRole('link', { name: /BTC\/USDT/ })
    .first()
    .click();
  await page.getByRole('link', { name: `Ver o plano com ${STRATEGY_NAME}` }).click({
    timeout: EVALUATION_TIMEOUT_MILLISECONDS,
  });
  const plan = page.getByRole('region', { name: 'Plano de operação' });
  await expect(plan).toContainText(STRATEGY_NAME);
  await expect(plan).toContainText(/Exato|Indicativo/);
  await expect(page.getByRole('img', { name: 'Gráfico do plano: preço e níveis' })).toBeVisible();
  await expect(page.locator('[data-level="target"]')).toHaveCount(1);
  await expect(page.locator('[data-level="stop"]')).toHaveCount(1);
}
