// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

import { sendFill, type Control } from './control.js';

const CARD = { name: 'Preço e operações', exact: true } as const;

// Pela Visão geral até o detalhe da simulação ao vivo; a compra e a venda gravadas pelo servidor de controle chegam pelo
// WebSocket e as setas aparecem sem recarregar a página (a faixa acompanha o fim).
export async function watchLiveFillsAppearOnTheChart(page: Page, control: Control): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Visão geral' })
    .click();
  const balance = page.getByRole('region', { name: 'Saldo da simulação' });
  await balance.getByRole('link', { name: 'Ver compras e vendas no gráfico' }).click();
  await expect(page).toHaveURL(/\/backtests\/[0-9a-f-]{36}$/);

  const card = page.getByRole('region', CARD);
  const arrows = card.locator('[data-chart-item]');
  await expect(card).toContainText('Acompanhando o fim da simulação');
  await expect(arrows).toHaveCount(0);

  await sendFill(control, 'buy');
  await expect(arrows).toHaveCount(1);
  await expect(card).toContainText(/última vela fechada às \d{2}:\d{2}/);
  await expect(card.getByRole('region', { name: 'Tabela de operações' })).toContainText('aberta');

  await sendFill(control, 'sell');
  await expect(arrows).toHaveCount(2);
  // O resumo das operações mora no cartão Acompanhamento (spec 008), não mais no cartão do gráfico.
  await expect(page.getByRole('region', { name: 'Acompanhamento', exact: true })).toContainText(
    /Você pagou 613,12 USDT em 1 compra e recebeu 614,38 USDT/,
  );
  await expect(card).toContainText('Acompanhando o fim da simulação');
}
