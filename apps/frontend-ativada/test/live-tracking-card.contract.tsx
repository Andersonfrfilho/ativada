// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readdirSync, readFileSync } from 'node:fs';

import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';

import { act, screen, within } from '@testing-library/react';

import { buildSummaryResponse } from './support/trade-chart-fixtures.js';
import { buildLiveStatusResponse } from './support/live-status-fixtures.js';
import {
  buildDecisionAt,
  buildRunSection,
  createLiveHarness,
  DAY,
  HOUR,
  LIVE_PERIOD_START,
  LIVE_RUN_ID,
  openLiveDetail,
} from './support/live-tracking-harness.js';

const TRACKING = { name: 'Acompanhamento' } as const;
// 16 h depois do início da simulação: 2026-01-01T15:00Z (12:00 em Brasília).
const SIXTEEN_HOURS_IN = new Date(LIVE_PERIOD_START + 16 * HOUR);

afterEach(() => {
  setSystemTime();
});

function goalOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    targetRate: '0.03',
    targetAmount: '1030',
    remainingAmount: '30',
    remainingRate: '0.03',
    deadlineAt: LIVE_PERIOD_START + 7 * DAY,
    remainingMilliseconds: 7 * DAY - 16 * HOUR,
    maxLossRate: '0.05',
    floorAmount: '950',
    lossRoomAmount: '50',
    outcome: null,
    outcomeAt: null,
    message: 'Meta: +3% em 7 dias.',
    ...overrides,
  };
}

function flatBalance(): Record<string, unknown> {
  return {
    initial: '1000',
    current: '1000',
    result: '0',
    resultRate: '0',
    observedAt: LIVE_PERIOD_START + 2 * HOUR,
    message: 'Seu saldo agora: 1.000,00 USDT.',
  };
}

describe('cartão "Acompanhamento" (T3.1)', () => {
  test('shows balance, result, buy and hold and the verdict with the fixture numbers', async () => {
    const harness = createLiveHarness({ tradeSummary: buildSummaryResponse() });
    openLiveDetail(harness);
    const card = await screen.findByRole('region', TRACKING);
    expect(await within(card).findByText('1.030,50')).toBeDefined();
    expect(within(card).getByText('começou com 1.000,00')).toBeDefined();
    expect(within(card).getByText('+30,50')).toBeDefined();
    expect(within(card).getByText('USDT · +3,05%')).toBeDefined();
    expect(within(card).getByText('1.020,00')).toBeDefined();
    expect(within(card).getByText('+20,00 · +2,00%')).toBeDefined();
    expect(
      within(card).getByText(
        'A estratégia está 1,05 pontos percentuais acima de comprar e segurar.',
      ),
    ).toBeDefined();
    expect(within(card).getByRole('button', { name: 'O que é Comprar e segurar?' })).toBeDefined();
  });

  test('zero is grey with "=" and, without trades, the empty state explains instead of zeros', async () => {
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({ balance: flatBalance() }),
    });
    openLiveDetail(harness);
    const card = await screen.findByRole('region', TRACKING);
    expect(await within(card).findByText('= 0,00')).toBeDefined();
    expect(within(card).getByText('igual ao início')).toBeDefined();
    expect(
      await within(card).findByRole('heading', {
        name: 'Nenhuma compra ainda: a estratégia está esperando',
      }),
    ).toBeDefined();
    expect(within(card).getByRole('link', { name: 'o que falta para comprar' })).toBeDefined();
    expect(screen.queryByText('Total pago')).toBeNull();
    expect(screen.queryByText('Compras')).toBeNull();
  });

  test('a pending buy changes the empty state: the order is asked, not absent', async () => {
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({
        balance: flatBalance(),
        decisions: {
          items: [
            buildDecisionAt(0, {
              action: 'BUY',
              outcome: 'buy_pending',
              message: 'Pediu compra: executa na abertura da próxima vela.',
            }),
          ],
          nextCursor: null,
        },
      }),
    });
    openLiveDetail(harness);
    const card = await screen.findByRole('region', TRACKING);
    expect(
      await within(card).findByRole('heading', {
        name: 'Compra pedida: executa na abertura da próxima vela',
      }),
    ).toBeDefined();
    expect(within(card).queryByText(/Nenhuma compra ainda/)).toBeNull();
  });

  test('a failed refresh keeps the card on screen and only warns how old the data is', async () => {
    const harness = createLiveHarness();
    const app = openLiveDetail(harness);
    const card = await screen.findByRole('region', TRACKING);
    expect(await within(card).findByText('1.030,50')).toBeDefined();
    harness.isLiveStatusFailing = true;
    act(() =>
      app.stream.emit({ type: 'event', runId: LIVE_RUN_ID, kind: 'fill', eventId: 'e1', at: 1 }),
    );
    expect(
      await screen.findByText(/Não foi possível atualizar agora; dados de há \d+ s/),
    ).toBeDefined();
    expect(screen.getByRole('region', TRACKING)).toBeDefined();
    expect(screen.queryByText(/Não foi possível carregar o acompanhamento/)).toBeNull();
  });

  test('a running simulation with no closed candle says when the first one closes', async () => {
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({
        decisions: { items: [], nextCursor: null },
        balance: { ...flatBalance(), observedAt: null, message: 'Ainda sem vela fechada.' },
        run: buildRunSection({
          lastCandleTime: null,
          lastDecisionAt: null,
          nextDecisionAt: LIVE_PERIOD_START + 2 * HOUR,
        }),
      }),
    });
    openLiveDetail(harness);
    const card = await screen.findByRole('region', TRACKING);
    expect(await within(card).findByText(/Aguardando a primeira vela, que /)).toBeDefined();
    expect(within(card).getByText('Ainda sem vela fechada.')).toBeDefined();
  });

  test('the card keeps the fixed notices short: candle, every hour and play money', async () => {
    openLiveDetail(createLiveHarness());
    const card = await screen.findByRole('region', TRACKING);
    const notices = await within(card).findByRole('list', { name: 'Avisos sobre a simulação' });
    expect(within(notices).getByText(/o resumo do preço em 1 hora/)).toBeDefined();
    expect(
      within(notices).getByText(/olha o mercado a cada 1 hora e decide só quando a vela/),
    ).toBeDefined();
    expect(within(notices).getByText(/dinheiro fictício; nada aqui é recomendação/)).toBeDefined();
  });
});

describe('bloco da meta (T3.1)', () => {
  test('shows target, deadline, what is missing and the meters 16 hours in', async () => {
    setSystemTime(SIXTEEN_HOURS_IN);
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({ balance: flatBalance(), goal: goalOf() }),
    });
    openLiveDetail(harness);
    const region = await screen.findByRole('region', { name: 'Meta: +3% em 7 dias' });
    expect(within(region).getByText('30,00 USDT')).toBeDefined();
    expect(within(region).getByText('(3,00%)')).toBeDefined();
    expect(within(region).getByText('1.030,00')).toBeDefined();
    expect(within(region).getByText('07/01 às 20:00')).toBeDefined();
    expect(within(region).getByText(/faltam 6 dias e 8 horas/)).toBeDefined();
    expect(within(region).getByText('0,00 de 30,00 USDT · 0%')).toBeDefined();
    expect(within(region).getByText('16 h de 7 dias · 9%')).toBeDefined();
    expect(within(region).getByText('0,00 de 50,00 USDT')).toBeDefined();
    expect(within(region).getByText(/Ainda cabem 50,00 USDT de queda/)).toBeDefined();
    expect(within(region).getAllByText('Abaixo do ritmo').length).toBeGreaterThan(0);
    expect(within(region).getByText(/hoje seria \+2,86 USDT/)).toBeDefined();
  });

  test('ahead of the linear pace the badge says "No caminho"', async () => {
    setSystemTime(SIXTEEN_HOURS_IN);
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({
        goal: goalOf({ remainingAmount: '0', remainingRate: '0' }),
      }),
    });
    openLiveDetail(harness);
    const region = await screen.findByRole('region', { name: 'Meta: +3% em 7 dias' });
    expect(within(region).getAllByText('No caminho').length).toBeGreaterThan(0);
    expect(within(region).queryByText('Abaixo do ritmo')).toBeNull();
  });

  test('a small delay against the linear pace is still "No caminho"', async () => {
    setSystemTime(SIXTEEN_HOURS_IN);
    const balance = { ...flatBalance(), current: '1002.7', result: '2.7', resultRate: '0.0027' };
    openLiveDetail(
      createLiveHarness({ liveStatus: buildLiveStatusResponse({ balance, goal: goalOf() }) }),
    );
    const region = await screen.findByRole('region', { name: 'Meta: +3% em 7 dias' });
    expect(within(region).getAllByText('No caminho').length).toBeGreaterThan(0);
  });

  test('before the first closed candle there is no pace to be behind of', async () => {
    setSystemTime(SIXTEEN_HOURS_IN);
    const balance = { ...flatBalance(), observedAt: null };
    openLiveDetail(
      createLiveHarness({ liveStatus: buildLiveStatusResponse({ balance, goal: goalOf() }) }),
    );
    const region = await screen.findByRole('region', { name: 'Meta: +3% em 7 dias' });
    expect(within(region).queryByText('Abaixo do ritmo')).toBeNull();
  });

  test('a recorded outcome replaces the meters with its own sentence', async () => {
    const harness = createLiveHarness({
      liveStatus: buildLiveStatusResponse({
        goal: goalOf({ outcome: 'goal_reached', outcomeAt: LIVE_PERIOD_START + 10 * HOUR }),
      }),
    });
    openLiveDetail(harness);
    const region = await screen.findByRole('region', { name: 'Meta: +3% em 7 dias' });
    expect(within(region).getByRole('status').textContent).toBe('Meta alcançada em 01/01 às 06:00');
    expect(within(region).queryByText('Ganho até agora')).toBeNull();
  });

  test('without a goal the block is gone', async () => {
    openLiveDetail(createLiveHarness());
    await screen.findByRole('region', TRACKING);
    expect(screen.queryByRole('region', { name: /^Meta:/ })).toBeNull();
  });
});

describe('estados da simulação', () => {
  test('a cancelled live run keeps the tracking card and the chart', async () => {
    const harness = createLiveHarness();
    harness.run = { ...harness.run, status: 'cancelled' };
    harness.liveStatus = buildLiveStatusResponse({
      run: buildRunSection({ status: 'cancelled', nextDecisionAt: null }),
    });
    openLiveDetail(harness);
    expect(await screen.findByRole('region', TRACKING)).toBeDefined();
    expect(await screen.findByRole('region', { name: 'Preço e operações' })).toBeDefined();
    expect(screen.getByText('Execução cancelada.').getAttribute('role')).toBe('status');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('estilo do acompanhamento', () => {
  test('no component of the tracking card carries an inline style', () => {
    const folder = new URL('../src/runs/live-tracking/', import.meta.url);
    const names = readdirSync(folder).filter((name) => name.endsWith('.tsx'));
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      expect(readFileSync(new URL(name, folder), 'utf8'), name).not.toContain('style=');
    }
  });
});
