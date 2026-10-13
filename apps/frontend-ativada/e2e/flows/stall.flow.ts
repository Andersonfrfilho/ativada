// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

import { sendStall, type Control } from './control.js';

const STALLED_BANNER = /Sua simulação está parada desde \d{2}:\d{2}/;

// A faixa de parada aparece e some sem recarregar: o servidor de controle grava `runs.stalled_since` e avisa pelo NOTIFY real,
// o WebSocket entrega e o painel relê a execução. Nunca só cor: a palavra "Parada." e o texto de que nada foi perdido.
export async function watchTheStalledBannerComeAndGo(page: Page, control: Control): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Visão geral' })
    .click();
  const balance = page.getByRole('region', { name: 'Saldo da simulação' });
  await expect(balance).toContainText('Rodando');
  await expect(balance).not.toContainText('Sua simulação está parada');

  await sendStall(control, 'stall');
  await expect(balance).toContainText(STALLED_BANNER);
  await expect(balance).toContainText('Parada.');
  await expect(balance).toContainText('nenhuma operação foi perdida');

  await sendStall(control, 'resume');
  await expect(balance).not.toContainText('Sua simulação está parada');
}
