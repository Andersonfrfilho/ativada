// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

import { sendDecision, type Control } from './control.js';

const TRACKING = { name: 'Acompanhamento', exact: true } as const;
const DECISIONS = { name: /^O que a estratégia decidiu/ } as const;

// Pela Visão geral até o acompanhamento da simulação ao vivo: o servidor de controle grava um sinal de ESPERAR e um ponto de
// patrimônio (o papel do worker) e o aviso do WebSocket traz a linha "Esperou" e o saldo novo, sem recarregar a página.
export async function watchTheTrackingGetANewDecision(page: Page, control: Control): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Visão geral' })
    .click();
  await page
    .getByRole('region', { name: 'Saldo da simulação' })
    .getByRole('link', { name: 'Ver o acompanhamento' })
    .click();
  await expect(page).toHaveURL(/\/backtests\/[0-9a-f-]{36}#acompanhamento$/);

  const tracking = page.getByRole('region', TRACKING);
  await expect(tracking).toContainText('Saldo agora');
  await expect(tracking).not.toContainText('10.500,00');
  await expect(page.getByRole('region', { name: 'Simulação rodando agora' })).toContainText(
    'Rodando',
  );

  await sendDecision(control);
  await expect(tracking).toContainText('10.500,00');
  const table = page.getByRole('region', DECISIONS);
  const newest = table.getByRole('row').nth(1);
  await expect(newest).toContainText('Esperou');
  await expect(newest).toContainText('0 de +2');
  await expect(page.getByRole('region', { name: 'Simulação rodando agora' })).toContainText(
    'Última decisão',
  );

  await newest.getByRole('button', { name: 'ver votos' }).click();
  await expect(table).toContainText('Detalhe técnico');
  await expect(table).toContainText('0 neutra');
}
