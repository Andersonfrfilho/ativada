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
  await expect(ranking).toContainText(
    /Favorável no histórico|Neutro no histórico|Desfavorável no histórico/,
  );
  await expect(page.getByRole('note', { name: 'Leia com cuidado' })).toContainText('histórico');
  const situations = page.getByRole('region', { name: 'Moedas: situação e próximo gatilho' });
  await expect(situations.getByRole('article', { name: 'BTC/USDT' })).toBeVisible();
  const picker = page.getByRole('group', { name: 'De quanto em quanto tempo olhar o mercado' });
  await expect(picker.getByRole('radio', { name: '1 hora' })).toBeChecked();
  await expect(picker).toContainText(
    'A simulação olha o mercado a cada 1 hora. Primeira vela fecha às',
  );
  await expect(picker).toContainText('O ranking desta meta é calculado com velas diárias');
  await page.getByRole('button', { name: `Simular esta meta com ${STRATEGY_NAME}` }).click();
  await expect(page).toHaveURL(/\/$/);
  // A meta vem do servidor (spec 008): alvo, perda máxima e o que falta.
  const card = page.getByRole('region', { name: /^Meta: \+3% em \d+ dias$/ });
  await expect(card).toContainText('Para bater a meta faltam');
  await expect(card).toContainText('Perda máxima aceita (−5%');
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
