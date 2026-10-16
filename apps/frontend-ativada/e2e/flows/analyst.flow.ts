// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type Page } from '@playwright/test';

import { sendAnalystDecision, type Control } from './control.js';
import { openMainLink, STRATEGY_NAME } from './goals.flow.js';

const EVALUATION_TIMEOUT_MILLISECONDS = 60_000;
const NOTICE_TIMEOUT_MILLISECONDS = 20_000;
const OPTION = 'Deixar o analista de risco decidir';
const MARKER = '__e2eAnalystMarker';

// Metas → a meta já declarada → "Deixar o analista de risco decidir" (trava a vela em 15 min) → simular: a API de verdade cria a
// simulação ao vivo de 15 min com o analista em modo sombra.
export async function createASimulationWithTheAnalyst(page: Page): Promise<void> {
  await openMainLink(page, 'Metas');
  await page
    .getByRole('link', { name: /BTC\/USDT/ })
    .first()
    .click();
  const ranking = page.getByRole('list', { name: 'Ranking de estratégias por moeda' });
  await expect(ranking).toContainText(STRATEGY_NAME, { timeout: EVALUATION_TIMEOUT_MILLISECONDS });
  const picker = page.getByRole('group', { name: 'De quanto em quanto tempo olhar o mercado' });
  await picker.getByRole('checkbox', { name: OPTION }).check();
  await expect(picker.getByRole('radio', { name: '15 minutos' })).toBeChecked();
  await expect(picker).toContainText('A vela fica travada em 15 minutos');
  await expect(picker).toContainText('Cada ida e volta (compra e venda) custa 0,30% do valor');
  await expect(picker).toContainText('Modo sombra: o analista só observa');
  await page.getByRole('button', { name: `Simular esta meta com ${STRATEGY_NAME}` }).click();
  await expect(page).toHaveURL(/\/$/);
}

// O servidor de controle (no papel do worker) grava a primeira decisão do analista e avisa pelo NOTIFY `analyst`; o painel mostra o
// cartão em PAUSA. A segunda decisão (LIBERADA) muda o cartão e o histórico sem recarregar a página (a marca na janela sobrevive).
export async function watchTheAnalystCardChange(page: Page, control: Control): Promise<void> {
  const runId = await sendAnalystDecision(control, 'pause');
  await page.goto(`/backtests/${runId}`);
  await page.evaluate((marker) => Reflect.set(window, marker, 'kept'), MARKER);

  const card = page.getByRole('region', { name: 'Analista de risco' });
  await expect(card).toContainText('PAUSA', { timeout: NOTICE_TIMEOUT_MILLISECONDS });
  await expect(card).toContainText('modo sombra: o analista só observa');
  await expect(card).toContainText('Tendência, não promessa');
  await expect(card).toContainText('dinheiro fictício');
  await expect(card.getByRole('table')).toContainText('Reversão');
  await expect(card.getByRole('region', { name: 'Travas' }).getByRole('listitem')).toHaveCount(5);

  await sendAnalystDecision(control, 'confident');
  await expect(card).toContainText('LIBERADA', { timeout: NOTICE_TIMEOUT_MILLISECONDS });
  await expect(card).not.toContainText('PAUSA');
  const history = page.getByRole('region', { name: 'Decisões do analista' });
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history).toContainText('PAUSA');
  await expect(history).toContainText('LIBERADA');
  const kept: unknown = await page.evaluate(
    (marker): unknown => Reflect.get(window, marker),
    MARKER,
  );
  expect(kept).toBe('kept');
}
