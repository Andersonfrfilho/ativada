// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

import { sendTick, type Control } from './control.js';
import { openMainLink } from './goals.flow.js';

// Registrar uma compra mostra preço médio, regra do dia, alvo e stop; o preço muda na tela sem recarregar.
export async function registerAPurchaseAndWatchThePrice(
  page: Page,
  control: Control,
): Promise<void> {
  await openMainLink(page, 'Ativos');
  await expect(page.getByRole('heading', { name: 'Seus ativos' })).toBeVisible();
  await page.getByLabel('Quantidade').fill('0.1');
  await page.getByLabel('Preço pago').fill('60000');
  await page.getByRole('button', { name: 'Registrar' }).click();
  const asset = page.getByRole('article', { name: 'BTC/USDT' });
  await expect(asset).toContainText('Quantidade 0,1');
  await expect(asset).toContainText('Preço médio 60.000,00');
  await expect(asset).toContainText(/Regra do dia: (Segurar|Vender|Aguardar)/);
  await expect(asset).toContainText(/Alvo [\d.]+,\d{2} · Stop [\d.]+,\d{2}/);
  await page.evaluate(() => Reflect.set(window, '__sameDocument', true));
  await sendTick(control, 'BTCUSDT', '63000.00');
  await expect(asset).toContainText('6.300,00 USDT');
  await expect(asset).toContainText('+300,00');
  await sendTick(control, 'BTCUSDT', '64000.00');
  await expect(asset).toContainText('6.400,00 USDT');
  const marker: unknown = await page.evaluate((): unknown => Reflect.get(window, '__sameDocument'));
  expect(marker).toBe(true);
  await page.getByLabel('Cotação do USDT em R$').fill('5,5');
  await expect(asset).toContainText('R$ 35.200,00');
}
