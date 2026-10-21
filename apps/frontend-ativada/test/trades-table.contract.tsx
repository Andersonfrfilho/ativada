// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor } from '@testing-library/react';

import type { Trade } from '../src/runs/run.validation.js';
import { EXIT_REASON_PLAIN_TEXT } from '../src/runs/run.constant.js';
import { TradesTable } from '../src/runs/TradesTable.component.js';
import {
  jsonResponse,
  pageResponse,
  type FakeRoute,
  type RecordedCall,
} from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

const TRADES_PATH = '/v1/runs/run-1/trades';
const FIRST_OPENING = Date.UTC(2026, 0, 1, 0, 0);
const HOUR = 3_600_000;

type TradeShape = Record<string, unknown>;

function closedTrade(index: number, overrides: TradeShape = {}): TradeShape {
  return {
    engineKey: `t${index}`,
    status: 'closed',
    entryPrice: '60000',
    quantity: '0.1',
    exitPrice: '61000',
    netProfit: '87.9',
    netProfitRate: '0.01463536',
    exitReason: 'target',
    openedCandleTime: FIRST_OPENING + index * HOUR,
    closedCandleTime: FIRST_OPENING + index * HOUR + HOUR,
    entryNotional: '6000',
    exitNotional: '6100',
    paid: '6006',
    received: '6093.9',
    fees: '12.1',
    ...overrides,
  };
}

function openTrade(index: number): TradeShape {
  return {
    engineKey: `o${index}`,
    status: 'open',
    entryPrice: '59000',
    quantity: '0.2',
    openedCandleTime: FIRST_OPENING + index * HOUR,
    entryNotional: '11800',
    paid: '11811.8',
    fees: '11.8',
  };
}

// Serve as páginas por cursor (o cursor é o deslocamento) e filtra por `status`, como o servidor.
function tradesRoute(all: readonly TradeShape[], pageSize: number | undefined): FakeRoute {
  return {
    method: 'GET',
    path: TRADES_PATH,
    respond: (call: RecordedCall): Response => {
      const status = call.query.get('status');
      const matching = all.filter((item) => status === null || item['status'] === status);
      if (pageSize === undefined) return pageResponse(matching);
      const start = Number(call.query.get('cursor') ?? 0);
      const items = matching.slice(start, start + pageSize);
      const next = start + pageSize < matching.length ? String(start + pageSize) : null;
      return pageResponse(items, next);
    },
  };
}

type TableOptions = {
  readonly trades: readonly TradeShape[];
  readonly pageSize?: number;
  readonly range?: { readonly from?: number; readonly to?: number };
  readonly selectedKey?: string;
  readonly timeZone?: string;
};

function showTable(options: TableOptions): {
  readonly selected: Trade[];
  readonly calls: () => RecordedCall[];
} {
  const selected: Trade[] = [];
  const rendered = renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [tradesRoute(options.trades, options.pageSize)],
    probe: (
      <TradesTable
        runId="run-1"
        range={options.range ?? {}}
        timeZone={options.timeZone ?? 'America/Sao_Paulo'}
        selectedKey={options.selectedKey}
        onSelectTrade={(trade) => selected.push(trade)}
      />
    ),
  });
  return { selected, calls: () => rendered.fake.callsTo('GET', TRADES_PATH) };
}

function scroller(): HTMLElement {
  return screen.getByRole('region', { name: 'Tabela de operações' });
}

function dataRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('tbody tr[aria-rowindex]'));
}

async function waitForRows(): Promise<void> {
  await waitFor(() => expect(dataRows().length).toBeGreaterThan(0));
}

function rowAt(rowIndex: number): HTMLElement | undefined {
  return dataRows().find((row) => row.getAttribute('aria-rowindex') === String(rowIndex));
}

describe('TradesTable: colunas do RF07', () => {
  test('shows time in the zone of the user with the offset, quantity, paid, received, fees, result and reason in plain Portuguese', async () => {
    showTable({
      trades: [
        closedTrade(0, {
          openedCandleTime: Date.UTC(2026, 3, 4, 14, 0),
          closedCandleTime: Date.UTC(2026, 3, 5, 14, 15),
        }),
      ],
    });
    await waitForRows();
    const row = dataRows()[0];
    const cells = Array.from(row?.querySelectorAll('td') ?? []).map((cell) => cell.textContent);
    expect(cells).toEqual([
      '04/04/2026 11:00',
      '05/04/2026 11:15',
      '60.000,00',
      '61.000,00',
      '0,1',
      '6.006,00',
      '6.093,90',
      '12,10',
      '+87,90 (+1,46%)',
      'atingiu o alvo de lucro',
    ]);
    expect(screen.getByRole('columnheader', { name: 'Compra (GMT−3)' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Venda (GMT−3)' })).toBeDefined();
  });

  test('the header offset follows the zone of the user (New York in winter)', async () => {
    showTable({ trades: [closedTrade(0)], timeZone: 'America/New_York' });
    expect(await screen.findByRole('columnheader', { name: 'Compra (GMT−5)' })).toBeDefined();
    expect(screen.getByText('31/12/2025 19:00')).toBeDefined();
  });

  test('money rounds against the user, like the summary: paid and fees up, received and result down', async () => {
    showTable({
      trades: [
        closedTrade(0, {
          paid: '613.1125',
          received: '613.1125',
          fees: '0.1125',
          netProfit: '0.1125',
        }),
      ],
    });
    await waitForRows();
    const cells = Array.from(dataRows()[0]?.querySelectorAll('td') ?? []).map(
      (cell) => cell.textContent,
    );
    expect(cells.slice(5, 9)).toEqual(['613,12', '613,11', '0,12', '+0,11 (+1,46%)']);
  });

  test('a loss shows the minus sign and the negative rate', async () => {
    showTable({
      trades: [closedTrade(0, { netProfit: '-2.1834', netProfitRate: '-0.01132513' })],
    });
    expect(await screen.findByText('-2,19 (-1,13%)')).toBeDefined();
  });

  test('every real exit reason has a plain sentence and an unknown one shows as it came', async () => {
    const reasons = [...Object.keys(EXIT_REASON_PLAIN_TEXT), 'novo_motivo'];
    showTable({
      trades: reasons.map((reason, index) => closedTrade(index, { exitReason: reason })),
    });
    await waitForRows();
    const text = document.body.textContent ?? '';
    expect(Object.keys(EXIT_REASON_PLAIN_TEXT).sort()).toEqual([
      'command',
      'gap',
      'signal',
      'stop',
      'target',
    ]);
    for (const sentence of Object.values(EXIT_REASON_PLAIN_TEXT)) expect(text).toContain(sentence);
    expect(text).toContain('novo_motivo');
  });

  test('an open trade is marked "aberta", with no sale and no result, above the closed ones', async () => {
    const { calls } = showTable({ trades: [closedTrade(0), openTrade(5)] });
    await screen.findByText('aberta');
    const first = dataRows()[0];
    const cells = Array.from(first?.querySelectorAll('td') ?? []).map((cell) => cell.textContent);
    expect(cells.slice(1)).toEqual([
      'aberta',
      '59.000,00',
      '—',
      '0,2',
      '11.811,80',
      '—',
      '11,80',
      '—',
      '—',
    ]);
    expect(dataRows()).toHaveLength(2);
    const statuses = calls().map((call) => call.query.get('status'));
    expect(statuses).toContain('open');
    expect(statuses).toContain('closed');
  });

  test('the chart range goes to the server as from and to', async () => {
    const { calls } = showTable({ trades: [closedTrade(0)], range: { from: 1_000, to: 9_000 } });
    await waitForRows();
    for (const call of calls()) {
      expect(call.query.get('from')).toBe('1000');
      expect(call.query.get('to')).toBe('9000');
    }
  });

  test('says so when there is no trade in the period, and when the server fails', async () => {
    showTable({ trades: [] });
    expect(await screen.findByText('Nenhuma operação no período.')).toBeDefined();
  });

  test('a server failure shows the alert instead of the table', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [
        { method: 'GET', path: TRADES_PATH, respond: (): Response => jsonResponse({}, 500) },
      ],
      probe: (
        <TradesTable
          runId="run-1"
          range={{}}
          timeZone="UTC"
          selectedKey={undefined}
          onSelectTrade={() => undefined}
        />
      ),
    });
    expect(await screen.findByRole('alert')).toBeDefined();
  });
});

describe('TradesTable: falha parcial', () => {
  test('when only the open trades fail, the alert shows next to the closed ones', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: TRADES_PATH,
          respond: (call: RecordedCall): Response =>
            call.query.get('status') === 'open'
              ? jsonResponse({}, 500)
              : pageResponse([closedTrade(0)]),
        },
      ],
      probe: (
        <TradesTable
          runId="run-1"
          range={{}}
          timeZone="UTC"
          selectedKey={undefined}
          onSelectTrade={() => undefined}
        />
      ),
    });
    expect(await screen.findByRole('alert')).toBeDefined();
    await waitForRows();
    expect(dataRows()).toHaveLength(1);
  });
});

describe('TradesTable: janela virtual', () => {
  const THOUSAND = Array.from({ length: 1_000 }, (_, index) => closedTrade(index));

  test('1,000 trades keep at most 60 rows in the DOM, with the right row count and indices', async () => {
    showTable({ trades: THOUSAND });
    await waitForRows();
    expect(document.querySelectorAll('tr').length).toBeLessThanOrEqual(60);
    expect(document.querySelector('table')?.getAttribute('aria-rowcount')).toBe('1001');
    expect(document.querySelector('thead tr')?.getAttribute('aria-rowindex')).toBe('1');
    expect(dataRows()[0]?.getAttribute('aria-rowindex')).toBe('2');
  });

  test('scrolling draws the rows of that place, still within the budget', async () => {
    showTable({ trades: THOUSAND });
    await waitForRows();
    fireEvent.scroll(scroller(), { target: { scrollTop: 20_000 } });
    // 20.000 px ÷ 44 px = linha 454 no topo; a margem de 6 abre na 448 (aria-rowindex 450).
    await waitFor(() => expect(rowAt(450)).toBeDefined());
    expect(document.querySelectorAll('tr').length).toBeLessThanOrEqual(60);
    expect(rowAt(2)).toBeUndefined();
    // Linha 454 = trade 454: 454 h depois de 01/01 00:00 UTC = 19/01 22:00 UTC = 19:00 em Brasília.
    expect(rowAt(456)?.querySelector('td')?.textContent).toBe('19/01/2026 19:00');
  });

  test('the spacers keep the height of the rows that are not drawn', async () => {
    showTable({ trades: THOUSAND });
    await waitForRows();
    const spacer = document.querySelector('tbody tr[aria-hidden="true"] td');
    expect(spacer?.getAttribute('height')).toBe(String((1_000 - 16) * 44));
  });

  test('loads the next page by cursor when the scroll gets near the end of what was loaded', async () => {
    const { calls } = showTable({
      trades: Array.from({ length: 250 }, (_, index) => closedTrade(index)),
      pageSize: 100,
    });
    await waitForRows();
    expect(document.querySelector('table')?.getAttribute('aria-rowcount')).toBe('-1');
    fireEvent.scroll(scroller(), { target: { scrollTop: 100_000 } });
    await waitFor(() =>
      expect(document.querySelector('table')?.getAttribute('aria-rowcount')).toBe('251'),
    );
    const cursors = calls()
      .filter((call) => call.query.get('status') === 'closed')
      .map((call) => call.query.get('cursor'));
    expect(cursors).toEqual([null, '100', '200']);
  });
});

describe('TradesTable: seleção', () => {
  test('a selected trade that is not in the list asks for at most 3 more pages and then gives up quietly', async () => {
    const { calls } = showTable({
      trades: Array.from({ length: 5_000 }, (_, index) => closedTrade(index)),
      pageSize: 100,
      selectedKey: 't4999',
    });
    await waitForRows();
    await waitFor(() =>
      expect(calls().filter((call) => call.query.get('status') === 'closed')).toHaveLength(4),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls().filter((call) => call.query.get('status') === 'closed')).toHaveLength(4);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelectorAll('tr[aria-current]')).toHaveLength(0);
  });

  test('marks the selected row with aria-current (aria-selected means nothing in a plain table)', async () => {
    showTable({ trades: [closedTrade(0), closedTrade(1)], selectedKey: 't1' });
    await waitForRows();
    const selected = document.querySelectorAll('tr[aria-current="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.getAttribute('aria-rowindex')).toBe('3');
    expect(document.querySelector('tr[aria-selected]')).toBeNull();
  });

  test('a click or Enter on a row reports that trade', async () => {
    const { selected } = showTable({ trades: [closedTrade(0), closedTrade(1)] });
    await waitForRows();
    fireEvent.click(rowAt(3) ?? document.body);
    fireEvent.keyDown(rowAt(2) ?? document.body, { key: 'Enter' });
    expect(selected.map((trade) => trade.engineKey)).toEqual(['t1', 't0']);
  });
});
