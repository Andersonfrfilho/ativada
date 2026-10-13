// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, mock, test, type Mock } from 'bun:test';

import { act, fireEvent, screen, within } from '@testing-library/react';

import { PriceChart } from '../src/runs/PriceChart.component.js';
import type { ChartRange } from '../src/runs/chart-range.js';
import { tradeChartSchema, type TradeChart } from '../src/runs/trade-chart.validation.js';
import { renderApp } from './support/render-app.js';
import {
  buildClusteredFixtureChart,
  buildFixtureChart,
  FIXTURE_CLUSTER,
  fillTime,
} from './fixtures/trade-chart.fixture.js';

const SAO_PAULO = 'America/Sao_Paulo';

function parseChart(raw: Record<string, unknown>): TradeChart {
  return tradeChartSchema.parse(raw);
}

function show(chart: TradeChart): Mock<(range: ChartRange) => void> {
  const onRangeChange = mock<(range: ChartRange) => void>();
  renderApp({
    path: '/',
    isAuthenticated: true,
    probe: <PriceChart chart={chart} timeZone={SAO_PAULO} onRangeChange={onRangeChange} />,
  });
  return onRangeChange;
}

function itemAt(index: number): HTMLElement {
  const item = items()[index];
  if (item === undefined) throw new Error(`sem item ${index}`);
  return item;
}

function items(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-chart-item]'));
}

function tooltipRows(): Record<string, string> {
  const tooltip = screen.getByRole('tooltip');
  return Object.fromEntries(
    Array.from(tooltip.querySelectorAll('dl > div')).map((row) => [
      row.querySelector('dt')?.textContent ?? '',
      row.querySelector('dd')?.textContent ?? '',
    ]),
  );
}

describe('PriceChart: setas', () => {
  test('draws 3 buys and 3 sells with different shapes, in the legend too', () => {
    show(parseChart(buildFixtureChart()));
    const kinds = items().map((item) => item.getAttribute('data-chart-item'));
    expect(kinds).toEqual(['buy', 'sell', 'buy', 'sell', 'buy', 'sell']);
    expect(screen.getByText('Compra (seta para cima)')).toBeDefined();
    expect(screen.getByText('Venda (seta para baixo)')).toBeDefined();
    const [buyPath, sellPath] = items().map((item) =>
      item.querySelector('path')?.getAttribute('d'),
    );
    expect(buyPath).toBeDefined();
    expect(buyPath).not.toBe(sellPath);
    expect(screen.getByRole('group', { name: 'Preço e operações' })).toBeDefined();
  });

  test('shows the axis in the zone of the user, with the price range', () => {
    show(parseChart(buildFixtureChart()));
    expect(screen.getByText('31/03/2026')).toBeDefined();
    expect(screen.getByText('10/05/2026')).toBeDefined();
    expect(screen.getByText('668,00')).toBeDefined();
    expect(screen.getByText('587,00')).toBeDefined();
  });
});

describe('PriceChart: dica', () => {
  test('a buy shows the time in the zone of the user, price, quantity, amount paid and fee', () => {
    show(parseChart(buildFixtureChart()));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(itemAt(0));
    expect(within(screen.getByRole('tooltip')).getByText('Compra')).toBeDefined();
    expect(tooltipRows()).toEqual({
      Quando: '04/04/2026 11:00 (GMT−3)',
      Preço: '609,00 USDT',
      Quantidade: '0,5 BNB',
      'Valor pago': '304,80 USDT',
      Taxa: '0,30 USDT',
    });
  });

  test('a sell shows the amount received, the fee and the result in USDT and %', () => {
    show(parseChart(buildFixtureChart()));
    fireEvent.focus(itemAt(1));
    expect(within(screen.getByRole('tooltip')).getByText('Venda')).toBeDefined();
    expect(tooltipRows()).toEqual({
      Quando: '09/04/2026 11:00 (GMT−3)',
      Preço: '612,50 USDT',
      Quantidade: '0,5 BNB',
      'Valor recebido': '305,94 USDT',
      Taxa: '0,31 USDT',
      Resultado: '+1,14 USDT (+0,37%)',
    });
  });

  test('a losing sell keeps the minus sign', () => {
    show(parseChart(buildFixtureChart()));
    fireEvent.focus(itemAt(5));
    expect(tooltipRows().Resultado).toBe('-2,18 USDT (-1,13%)');
  });

  test('the marker points at the tip with aria-describedby only while it is open', () => {
    show(parseChart(buildFixtureChart()));
    const first = itemAt(0);
    expect(first.getAttribute('aria-describedby')).toBeNull();
    fireEvent.focus(first);
    expect(first.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
    expect(first.getAttribute('aria-label')).toContain('Valor pago 304,80 USDT');
  });

  test('mouse over opens, leaving closes, and Esc closes while the focus stays', () => {
    show(parseChart(buildFixtureChart()));
    const first = itemAt(0);
    fireEvent.mouseEnter(first);
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.mouseLeave(first);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(first);
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByText(/Passe o mouse, toque ou use Tab/)).toBeDefined();
  });
});

describe('PriceChart: teclado', () => {
  test('every marker is a tab stop, in TIME order even if the server sends another order', () => {
    const chart = parseChart(buildFixtureChart());
    show({ ...chart, markers: [...(chart.markers ?? [])].reverse() });
    const stops = items();
    expect(stops).toHaveLength(6);
    expect(stops.every((item) => item.getAttribute('tabindex') === '0')).toBe(true);
    const labels = stops.map((item) => item.getAttribute('aria-label') ?? '');
    expect(labels.map((label) => label.slice(0, 6))).toEqual([
      'Compra',
      'Venda:',
      'Compra',
      'Venda:',
      'Compra',
      'Venda:',
    ]);
    expect(labels[0]).toContain('04/04/2026');
    expect(labels[5]).toContain('30/04/2026');
  });

  test('the arrows walk the markers in time order and stop at the ends', () => {
    show(parseChart(buildFixtureChart()));
    void act(() => {
      itemAt(0).focus();
    });
    expect(document.activeElement).toBe(itemAt(0));
    for (const index of [1, 2, 3, 4, 5]) {
      fireEvent.keyDown(itemAt(index - 1), { key: 'ArrowRight' });
      expect(document.activeElement).toBe(itemAt(index));
    }
    fireEvent.keyDown(itemAt(5), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(itemAt(5));
    fireEvent.keyDown(itemAt(5), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(itemAt(4));
  });

  test('the times of the markers are the ones of the fixture', () => {
    expect(tradeChartSchema.parse(buildFixtureChart()).markers?.[0]?.candleTime).toBe(fillTime(3));
  });
});

describe('PriceChart: agrupamento', () => {
  test('a cluster replaces the arrows and says to zoom in', () => {
    show(parseChart(buildClusteredFixtureChart()));
    expect(items()).toHaveLength(1);
    const cluster = screen.getByRole('button', {
      name: '12 compras, 11 vendas. Aproxime para ver cada operação',
    });
    expect(cluster.textContent).toBe('23');
    fireEvent.focus(cluster);
    expect(within(screen.getByRole('tooltip')).getByText('12 compras, 11 vendas')).toBeDefined();
    expect(
      within(screen.getByRole('tooltip')).getByText('Aproxime para ver cada operação'),
    ).toBeDefined();
    expect(screen.getByText('Várias operações juntas')).toBeDefined();
  });

  test('Enter, space and click zoom into the range of the cluster', () => {
    const onRangeChange = show(parseChart(buildClusteredFixtureChart()));
    const cluster = itemAt(0);
    fireEvent.keyDown(cluster, { key: 'Enter' });
    fireEvent.keyDown(cluster, { key: ' ' });
    fireEvent.click(cluster);
    expect(onRangeChange).toHaveBeenCalledTimes(3);
    for (const call of onRangeChange.mock.calls) {
      expect(call[0]).toEqual({ from: FIXTURE_CLUSTER.startTime, to: FIXTURE_CLUSTER.endTime });
    }
  });

  test('other keys do not zoom', () => {
    const onRangeChange = show(parseChart(buildClusteredFixtureChart()));
    fireEvent.keyDown(itemAt(0), { key: 'a' });
    expect(onRangeChange).not.toHaveBeenCalled();
  });
});
