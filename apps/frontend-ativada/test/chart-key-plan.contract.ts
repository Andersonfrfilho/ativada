// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  CHART_KEYBOARD_HELP,
  planChartKey,
  type ChartKeyAction,
  type ChartKeyInput,
} from '../src/runs/candle-chart/chart-key-plan.js';
import { describeForecast } from '../src/runs/candle-chart/forecast-description.js';
import { describeEventsAt, listEventIndexes } from '../src/runs/candle-chart/marker-series.js';
import {
  judgeNextCandle,
  type NextCandleState,
} from '../src/runs/candle-chart/next-candle-state.js';
import {
  projectionsSchema,
  type ProjectionCurrent,
} from '../src/runs/candle-chart/projections.validation.js';
import { describeChart } from '../src/runs/chart-description.js';
import { tradeChartSchema } from '../src/runs/trade-chart.validation.js';
import { buildFixtureChart } from './fixtures/trade-chart.fixture.js';
import {
  buildProjectionsResponse,
  FIRST_CANDLE_TIME,
  HOUR_MILLISECONDS,
} from './support/candle-chart-fixtures.js';

function plan(key: string, overrides: Partial<ChartKeyInput> = {}): ChartKeyAction | undefined {
  return planChartKey({
    key,
    shiftKey: false,
    current: 5,
    count: 10,
    events: [1, 5, 9],
    ...overrides,
  });
}

describe('teclado do gráfico: plano de cada tecla', () => {
  test('the arrows walk one candle, the first press lands on the newest', () => {
    expect(plan('ArrowLeft')).toStrictEqual({ type: 'move', index: 4 });
    expect(plan('ArrowRight')).toStrictEqual({ type: 'move', index: 6 });
    expect(plan('ArrowLeft', { current: null })).toStrictEqual({ type: 'move', index: 9 });
    expect(plan('ArrowRight', { current: null })).toStrictEqual({ type: 'move', index: 9 });
  });

  test('at the ends the arrow stays put', () => {
    expect(plan('ArrowLeft', { current: 0 })).toBeUndefined();
    expect(plan('ArrowRight', { current: 9 })).toBeUndefined();
    expect(plan('ArrowRight', { count: 0, current: null })).toBeUndefined();
  });

  test('Home and End go to the ends, with or without Shift', () => {
    expect(plan('Home')).toStrictEqual({ type: 'move', index: 0 });
    expect(plan('End')).toStrictEqual({ type: 'move', index: 9 });
    expect(plan('End', { shiftKey: true })).toStrictEqual({ type: 'move', index: 9 });
  });

  test('Shift with an arrow jumps to the next or previous buy or sell', () => {
    expect(plan('ArrowRight', { shiftKey: true, current: 1 })).toStrictEqual({
      type: 'move',
      index: 5,
    });
    expect(plan('ArrowRight', { shiftKey: true, current: 3 })).toStrictEqual({
      type: 'move',
      index: 5,
    });
    expect(plan('ArrowLeft', { shiftKey: true, current: 5 })).toStrictEqual({
      type: 'move',
      index: 1,
    });
    expect(plan('ArrowLeft', { shiftKey: true, current: 9 })).toStrictEqual({
      type: 'move',
      index: 5,
    });
    expect(plan('ArrowRight', { shiftKey: true, current: null })).toStrictEqual({
      type: 'move',
      index: 1,
    });
    expect(plan('ArrowLeft', { shiftKey: true, current: null })).toStrictEqual({
      type: 'move',
      index: 9,
    });
  });

  test('past the last event there is nowhere to jump, and with no events nothing happens', () => {
    expect(plan('ArrowRight', { shiftKey: true, current: 9 })).toBeUndefined();
    expect(plan('ArrowLeft', { shiftKey: true, current: 1 })).toBeUndefined();
    expect(plan('ArrowRight', { shiftKey: true, events: [] })).toBeUndefined();
  });

  test('plus and minus zoom, Esc clears and Enter picks only when a candle is pointed', () => {
    expect(plan('+')).toStrictEqual({ type: 'zoom', step: 1 });
    expect(plan('=')).toStrictEqual({ type: 'zoom', step: 1 });
    expect(plan('-')).toStrictEqual({ type: 'zoom', step: -1 });
    expect(plan('−')).toStrictEqual({ type: 'zoom', step: -1 });
    expect(plan('Escape')).toStrictEqual({ type: 'clear' });
    expect(plan('Enter')).toStrictEqual({ type: 'pick' });
    expect(plan('Enter', { current: null })).toBeUndefined();
  });

  test('a key that is not the chart’s is left to the browser', () => {
    expect(plan('Tab')).toBeUndefined();
    expect(plan('a')).toBeUndefined();
  });

  test('the help text names every key', () => {
    expect(CHART_KEYBOARD_HELP).toBe(
      'Setas esquerda e direita andam uma vela; Shift com seta pula para a próxima compra ou venda; ' +
        'mais e menos aproximam e afastam; Home e End vão às pontas; Esc limpa a cruz; Enter seleciona a operação.',
    );
  });
});

describe('compras e vendas por vela', () => {
  const hour = 3_600_000;
  const candles = [0, 1, 2, 3, 4].map((index) => ({ openTime: index * hour }));
  const markers = [
    { positionKey: 'p1', side: 'buy', candleTime: 1 * hour + 20 * 60_000 },
    { positionKey: 'p1', side: 'sell', candleTime: 3 * hour },
    { positionKey: 'p2', side: 'buy', candleTime: 3 * hour + 5 },
  ] as const;

  test('the events fall on the candle that contains the fill, in order', () => {
    expect(listEventIndexes(candles, markers, hour)).toStrictEqual([1, 3]);
    expect(listEventIndexes(candles, null, hour)).toStrictEqual([]);
    expect(listEventIndexes(candles, markers, 0)).toStrictEqual([]);
  });

  test('the speech label says buy, sell or both', () => {
    expect(describeEventsAt(markers, 1 * hour, hour)).toBe('compra');
    expect(describeEventsAt(markers, 3 * hour, hour)).toBe('compra e venda');
    expect(describeEventsAt(markers, 2 * hour, hour)).toBeUndefined();
    expect(describeEventsAt([markers[1]], 3 * hour, hour)).toBe('venda');
    expect(describeEventsAt(null, 3 * hour, hour)).toBeUndefined();
  });
});

describe('descrição textual com a previsão (RF20)', () => {
  const now = FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS - 15 * 60_000;
  const zone = 'America/Sao_Paulo';

  function stateOf(projection: ProjectionCurrent): NextCandleState {
    return judgeNextCandle({
      isStrategyTimeframe: true,
      runTimeframe: '1h',
      projection,
      isError: false,
      live: undefined,
      now,
    });
  }

  function currentOf(overrides: Record<string, unknown> = {}): ProjectionCurrent {
    const current = Object.assign({}, buildProjectionsResponse()['current'], overrides);
    return projectionsSchema.parse(buildProjectionsResponse({ current })).current;
  }

  test('a trend becomes one sentence with the stance, the strength, the time and the band', () => {
    expect(describeForecast({ state: stateOf(currentOf()), now, timeZone: zone })).toBe(
      'Previsão: tende a comprar (fraco) até 05:00, faixa de 12,778 a 13,032.',
    );
    const sell = currentOf({ side: 'sell', stance: 'stay_out', strength: 'decided' });
    expect(describeForecast({ state: stateOf(sell), now, timeZone: zone })).toBe(
      'Previsão: tende a ficar de fora (decidiu) até 05:00, faixa de 12,778 a 13,032.',
    );
    const noBand = currentOf({ bandLow: null, bandHigh: null, stance: 'hold' });
    expect(describeForecast({ state: stateOf(noBand), now, timeZone: zone })).toBe(
      'Previsão: tende a segurar (fraco) até 05:00.',
    );
  });

  test('without a trend the server reason is said, and while loading nothing is', () => {
    const neutral = {
      status: 'unavailable',
      reason: 'neutral',
      message: 'O placar está em 0.',
    } as const;
    expect(describeForecast({ state: stateOf(neutral), now, timeZone: zone })).toBe(
      'Sem previsão agora: O placar está em 0.',
    );
    expect(describeForecast({ state: { kind: 'loading' }, now, timeZone: zone })).toBeUndefined();
    expect(describeForecast({ state: { kind: 'error' }, now, timeZone: zone })).toBeUndefined();
  });

  test('the chart description appends the forecast and is unchanged without it', () => {
    const chart = tradeChartSchema.parse(buildFixtureChart());
    const plain = describeChart({ chart, timeZone: 'UTC' });
    const withForecast = describeChart({
      chart,
      timeZone: 'UTC',
      forecast: 'Previsão: tende a comprar.',
    });
    expect(withForecast).toBe(`${plain} Previsão: tende a comprar.`);
    expect(describeChart({ chart, timeZone: 'UTC', forecast: undefined })).toBe(plain);
  });
});
