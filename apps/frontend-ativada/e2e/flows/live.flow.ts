// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page, type WebSocketRoute } from '@playwright/test';

import { sendTick, type Control } from './control.js';

const STREAM_PATTERN = /\/v1\/stream/;
const RECOVERY_TIMEOUT_MILLISECONDS = 40_000;
const RETRY_SLICE_MILLISECONDS = 3_000;

// Uma segunda aba da mesma sessão, com o WebSocket do painel interceptado: dá para derrubá-lo e segurar a volta.
export async function dropTheSocketAndComeBack(page: Page, control: Control): Promise<void> {
  const second = await page.context().newPage();
  let isBlocked = false;
  const open: WebSocketRoute[] = [];
  await second.routeWebSocket(STREAM_PATTERN, (route) => {
    if (isBlocked) {
      void route.close();
      return;
    }
    route.connectToServer();
    open.push(route);
  });
  await second.goto('/');
  const bitcoin = second.getByRole('article', { name: 'BTC/USDT' });
  await expect(async () => {
    await sendTick(control, 'BTCUSDT', '65000.00');
    await expect(second.getByText('Preços ao vivo')).toBeVisible({
      timeout: RETRY_SLICE_MILLISECONDS,
    });
  }).toPass({ timeout: RECOVERY_TIMEOUT_MILLISECONDS });
  await expect(bitcoin).toContainText('65.000,00');

  isBlocked = true;
  await Promise.all(open.map((route) => route.close()));
  await expect(second.getByRole('status').filter({ hasText: 'Sem dados' })).toBeVisible();

  isBlocked = false;
  await expect(async () => {
    await sendTick(control, 'BTCUSDT', '65432.10');
    await expect(second.getByText('Preços ao vivo')).toBeVisible({
      timeout: RETRY_SLICE_MILLISECONDS,
    });
  }).toPass({ timeout: RECOVERY_TIMEOUT_MILLISECONDS });
  await expect(bitcoin).toContainText('65.432,10');
  await second.close();
}
