// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

import { sendTick, type Control } from './control.js';
import { openMainLink } from './goals.flow.js';

const HIGH_PRICE = '9000000.00';
const NORMAL_PRICE = '61000.00';

// "Avisar no plano" grava o alerta de alvo; o preço sobe pelo ticker e o alerta dispara sozinho, sem recarregar.
export async function alertOnTheTargetAndLetTheTickFireIt(
  page: Page,
  control: Control,
): Promise<void> {
  await page.getByRole('button', { name: /^Avisar no plano: alvo em/ }).click();
  await expect(page.getByText('Alerta criado: avisamos quando o preço chegar lá.')).toBeVisible();
  await openMainLink(page, 'Alertas');
  const board = page.getByRole('list', { name: 'Gerenciar alertas de preço' });
  await expect(board).toContainText('Armado');
  await page.evaluate(() => Reflect.set(window, '__sameDocument', true));
  await sendTick(control, 'BTCUSDT', HIGH_PRICE);
  await expect(board).toContainText('Disparado');
  const fired = page.getByRole('list', { name: 'Alertas de preço disparados' });
  await expect(fired).toContainText('BTC/USDT subiu acima de');
  const marker: unknown = await page.evaluate((): unknown => Reflect.get(window, '__sameDocument'));
  expect(marker).toBe(true);
  await page.getByRole('button', { name: 'Limpar disparados' }).click();
  await expect(fired).toHaveCount(0);
  await sendTick(control, 'BTCUSDT', NORMAL_PRICE);
}
