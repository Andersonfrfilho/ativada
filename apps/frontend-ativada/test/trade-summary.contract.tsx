// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import { TradeNotice } from '../src/runs/TradeNotice.component.js';
import { TradeSummary } from '../src/runs/TradeSummary.component.js';
import { dataResponse, jsonResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';
import { buildSummaryResponse } from './support/trade-chart-fixtures.js';

const SUMMARY_PATH = '/v1/runs/run-1/trade-summary';

function show(probe: ReactElement, routes: readonly FakeRoute[] = []): void {
  renderApp({ path: '/', isAuthenticated: true, routes, probe });
}

function summaryRoute(overrides: Record<string, unknown>): FakeRoute {
  return {
    method: 'GET',
    path: SUMMARY_PATH,
    respond: (): Response => dataResponse(buildSummaryResponse(overrides)),
  };
}

function facts(): Record<string, string> {
  const region = screen.getByRole('region', { name: 'Resumo das operações' });
  return Object.fromEntries(
    Array.from(region.querySelectorAll('dt')).map((term) => [
      term.textContent ?? '',
      term.nextElementSibling?.textContent ?? '',
    ]),
  );
}

describe('TradeSummary', () => {
  test('shows the sentence of the server and the numbers behind it', async () => {
    show(<TradeSummary runId="run-1" />, [summaryRoute({})]);
    expect(
      await screen.findByText(
        'Você pagou 201,20 USDT em 1 compra e recebeu 202,29 USDT nas vendas.',
      ),
    ).toBeDefined();
    expect(facts()).toEqual({
      'Total pago': '201,20 USDT',
      'Total recebido': '202,30 USDT',
      Taxas: '0,40 USDT',
      'Saldo líquido': '+1,10 USDT',
      Compras: '1',
      Vendas: '1',
    });
  });

  test('a loss shows the minus sign and an open trade shows what was paid on it', async () => {
    show(<TradeSummary runId="run-1" />, [
      summaryRoute({ net: '-508.12', openTrades: 1, openPaid: '412', closedTrades: 3 }),
    ]);
    expect(await screen.findByText('ainda aberta: 412,00 USDT pagos')).toBeDefined();
    expect(facts()['Saldo líquido']).toBe('-508,12 USDT');
    expect(facts()['Compras']).toBe('4');
    expect(facts()['Vendas']).toBe('3');
  });

  test('without an open trade there is no "still open" line', async () => {
    show(<TradeSummary runId="run-1" />, [summaryRoute({})]);
    await screen.findByRole('region', { name: 'Resumo das operações' });
    expect(screen.queryByText(/ainda aberta/)).toBeNull();
  });

  test('says so while loading and when the server fails', async () => {
    show(<TradeSummary runId="run-1" />, [
      { method: 'GET', path: SUMMARY_PATH, respond: (): Response => jsonResponse({}, 500) },
    ]);
    expect(screen.getByText('Carregando…')).toBeDefined();
    expect(await screen.findByRole('alert')).toBeDefined();
  });

  test('a summary the server sent with a number that is not decimal is refused', async () => {
    show(<TradeSummary runId="run-1" />, [summaryRoute({ net: 'NaN' })]);
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Resumo das operações' })).toBeNull();
  });
});

describe('TradeNotice (RF16)', () => {
  test('a backtest carries the history notice and no claim about simulation', () => {
    show(<TradeNotice isLive={false} />);
    const note = screen.getByRole('note', { name: 'Leia com cuidado sobre as operações' });
    expect(note.textContent).toContain('Isto é o histórico');
    expect(note.textContent).toContain('O passado não promete o futuro');
    expect(note.textContent).toContain('nada aqui é recomendação de investimento');
    expect(note.textContent).not.toContain('nenhum dinheiro real');
  });

  test('a live simulation carries the same notice plus "no real money"', () => {
    show(<TradeNotice isLive />);
    const note = screen.getByRole('note', { name: 'Leia com cuidado sobre as operações' });
    expect(note.textContent).toContain('O passado não promete o futuro');
    expect(note.textContent).toContain('Simulação: nenhum dinheiro real foi usado.');
  });
});
