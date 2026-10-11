// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type APIRequestContext, type Page } from '@playwright/test';

const LIVE_REASON = 'Compra 4/4: sinal chegado ao vivo';

// O worker e o ticker são fingidos pelo servidor de controle; o resto (NOTIFY, API, WebSocket, painel) é de verdade.
export async function receiveLiveAlertsWithoutReloading(
  page: Page,
  control: { readonly request: APIRequestContext; readonly url: string },
): Promise<void> {
  await page.getByRole('link', { name: 'Alertas' }).click();
  const history = page.getByRole('list', { name: 'Histórico de sinais' });
  await expect(history).toBeVisible();
  await expect(page.getByText('Ao vivo', { exact: true })).toBeVisible();
  await page.evaluate(() => Reflect.set(window, '__sameDocument', true));

  await control.request.post(`${control.url}/signal`);
  await expect(history).toContainText(LIVE_REASON);

  await control.request.post(`${control.url}/price-alert`);
  const fired = page.getByRole('list', { name: 'Alertas de preço disparados' });
  await expect(fired).toContainText('BTC/USDT subiu acima de 65.000,00');
  const marker: unknown = await page.evaluate((): unknown => Reflect.get(window, '__sameDocument'));
  expect(marker).toBe(true);

  await page.getByRole('button', { name: 'Limpar disparados' }).click();
  await expect(page.getByText('1 alerta apagado.')).toBeVisible();
  await expect(fired).toHaveCount(0);
}
