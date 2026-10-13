// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  describeChart,
  describeClusterItem,
  describeMarker,
} from '../src/runs/chart-description.js';
import { tradeChartSchema, type TradeChart } from '../src/runs/trade-chart.validation.js';
import {
  buildClusteredFixtureChart,
  buildFixtureChart,
  FIXTURE_FROM,
  FIXTURE_TO,
} from './fixtures/trade-chart.fixture.js';

const SAO_PAULO = 'America/Sao_Paulo';

function chartWith(overrides: Record<string, unknown> = {}): TradeChart {
  return tradeChartSchema.parse(buildFixtureChart(overrides));
}

describe('describeChart', () => {
  test('names the coin, the period, the prices and the counts, with the numbers of the fixture', () => {
    expect(describeChart({ chart: chartWith(), timeZone: 'UTC' })).toBe(
      'Preço de BNB/USDT de 01/04 a 10/05. ' +
        'Começou em 600,00 USDT e terminou em 652,50 USDT, ' +
        'com mínima de 587,00 USDT e máxima de 668,00 USDT. ' +
        '3 compras e 3 vendas.',
    );
  });

  test('the days are the ones of the zone of the user', () => {
    expect(describeChart({ chart: chartWith(), timeZone: SAO_PAULO })).toStartWith(
      'Preço de BNB/USDT de 31/03 a 10/05.',
    );
  });

  test('singular and plural', () => {
    const one = chartWith({ totals: { buys: 1, sells: 1 } });
    expect(describeChart({ chart: one, timeZone: 'UTC' })).toEndWith('1 compra e 1 venda.');
    const many = chartWith({ totals: { buys: 12, sells: 11 } });
    expect(describeChart({ chart: many, timeZone: 'UTC' })).toEndWith('12 compras e 11 vendas.');
  });

  test('without any operation it says so', () => {
    const none = chartWith({ markers: [], totals: { buys: 0, sells: 0 } });
    expect(describeChart({ chart: none, timeZone: 'UTC' })).toEndWith(
      'Nenhuma operação neste período.',
    );
  });

  test('with clusters it explains why there are no arrows', () => {
    const grouped = tradeChartSchema.parse(buildClusteredFixtureChart());
    expect(describeChart({ chart: grouped, timeZone: 'UTC' })).toEndWith(
      '12 compras e 11 vendas. As operações estão agrupadas: aproxime o período para ver cada uma.',
    );
  });

  test('a period that crosses the year shows the years', () => {
    const crossing = chartWith({
      from: Date.parse('2025-12-31T00:00:00.000Z'),
      to: Date.parse('2026-01-03T00:00:00.000Z'),
    });
    expect(describeChart({ chart: crossing, timeZone: 'UTC' })).toStartWith(
      'Preço de BNB/USDT de 31/12/2025 a 02/01/2026.',
    );
  });

  test('without price columns (a run still in the queue) it says there is nothing yet', () => {
    const empty = chartWith({ columns: [], markers: [], totals: { buys: 0, sells: 0 } });
    expect(describeChart({ chart: empty, timeZone: 'UTC' })).toBe(
      'Preço de BNB/USDT de 01/04 a 10/05. Ainda não há preços neste período. ' +
        'Nenhuma operação neste período.',
    );
  });

  test('the period of the fixture is what the text says', () => {
    expect(FIXTURE_TO - FIXTURE_FROM).toBe(40 * 86_400_000);
  });
});

describe('describeMarker e describeClusterItem', () => {
  const chart = chartWith();
  const [buy, sell] = chart.markers ?? [];

  test('a buy: title and each field of the tooltip, in order, in the zone of the user', () => {
    if (buy === undefined) throw new Error('fixture sem compra');
    expect(describeMarker({ marker: buy, symbol: chart.symbol, timeZone: SAO_PAULO })).toBe(
      'Compra: Quando 04/04/2026 11:00 (GMT−3); Preço 609,00 USDT; Quantidade 0,5 BNB; ' +
        'Valor pago 304,80 USDT; Taxa 0,30 USDT',
    );
  });

  test('a sell: amount received, fee and the result in USDT and %', () => {
    if (sell === undefined) throw new Error('fixture sem venda');
    expect(describeMarker({ marker: sell, symbol: chart.symbol, timeZone: SAO_PAULO })).toBe(
      'Venda: Quando 09/04/2026 11:00 (GMT−3); Preço 612,50 USDT; Quantidade 0,5 BNB; ' +
        'Valor recebido 305,94 USDT; Taxa 0,31 USDT; Resultado +1,14 USDT (+0,37%)',
    );
  });

  test('a cluster: the counts and what to do', () => {
    expect(describeClusterItem({ startTime: 1, endTime: 2, buys: 12, sells: 11 })).toBe(
      '12 compras, 11 vendas. Aproxime para ver cada operação',
    );
  });
});
