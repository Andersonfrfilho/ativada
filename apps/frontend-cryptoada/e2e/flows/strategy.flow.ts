// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

const COPY_NAME = 'Placar clássico (cópia)';

// Duplica o exemplo, muda um parâmetro e confere que salvar gera a versão 2 (com o hash), depois apaga a cópia.
export async function editStrategyIntoANewVersion(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Estratégias' }).click();
  await page.getByRole('button', { name: 'Duplicar Placar clássico', exact: true }).click();
  await expect(page.getByRole('heading', { name: COPY_NAME })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Versões' }).getByRole('listitem')).toHaveCount(1);
  const buy = page.getByLabel('Limiar de compra');
  const original = await buy.inputValue();
  await buy.fill('1.5');
  await page.getByRole('button', { name: 'Salvar como nova versão' }).click();
  await expect(page.getByText(/Versão 2 criada \(hash [0-9a-f]{8}\)\./)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Versões' }).getByRole('listitem')).toHaveCount(2);
  expect(original).not.toBe('1.5');
  await page.getByRole('button', { name: 'Usar a versão 1 como base' }).click();
  await expect(page.getByLabel('Limiar de compra')).toHaveValue(original);
}

export async function deleteTheCopy(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Estratégias' }).click();
  await page.getByRole('button', { name: `Apagar ${COPY_NAME}` }).click();
  await page.getByRole('button', { name: `Confirmar: apagar ${COPY_NAME}` }).click();
  await expect(page.getByRole('link', { name: COPY_NAME })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Placar clássico', exact: true })).toBeVisible();
}
