// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import {
  barsForPeriod,
  CHART_PERIOD,
  pickPeriodTimeframe,
} from '../src/runs/candle-chart/chart-period.js';
import {
  FIXTURE_FROM,
  showCandleCard,
  type CandleCardHarness,
} from './support/candle-card-harness.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const HOUR = 3_600_000;

describe('atalhos de período: a vela e quantas velas', () => {
  test('each period asks for the candle that fits it, or the closest one offered', () => {
    const all = ['15m', '1h', '4h', '1d'] as const;
    expect(pickPeriodTimeframe(CHART_PERIOD.DAY, all)).toBe('15m');
    expect(pickPeriodTimeframe(CHART_PERIOD.WEEK, all)).toBe('1h');
    expect(pickPeriodTimeframe(CHART_PERIOD.MONTH, all)).toBe('4h');
    expect(pickPeriodTimeframe(CHART_PERIOD.YEAR, all)).toBe('1d');
    expect(pickPeriodTimeframe(CHART_PERIOD.ALL, all)).toBe('1d');
    expect(pickPeriodTimeframe(CHART_PERIOD.DAY, ['1h', '1d'])).toBe('1h');
    expect(pickPeriodTimeframe(CHART_PERIOD.YEAR, [])).toBeUndefined();
  });

  test('the bars cover the period, and "all" has no count', () => {
    expect(barsForPeriod(CHART_PERIOD.DAY, HOUR / 4)).toBe(96);
    expect(barsForPeriod(CHART_PERIOD.WEEK, HOUR)).toBe(168);
    expect(barsForPeriod(CHART_PERIOD.YEAR, 24 * HOUR)).toBe(365);
    expect(barsForPeriod(CHART_PERIOD.ALL, 24 * HOUR)).toBeUndefined();
  });
});

function surfaceCalls(harness: CandleCardHarness, method: 'showLast' | 'fit'): unknown[][] {
  return harness.surfaces.flatMap((surface) => surface.callsOf(method).map((args) => [...args]));
}

describe('atalhos de período no gráfico', () => {
  test('"Último ano" switches to daily candles and frames the last 365', async () => {
    const harness = showCandleCard({ marketTimeframes: ['1h', '4h', '1d'] });
    fireEvent.click(await screen.findByRole('button', { name: 'Último ano' }));
    await waitFor(() =>
      expect(harness.candleCalls().some((call) => call.query.get('timeframe') === '1d')).toBe(true),
    );
    await waitFor(() => expect(surfaceCalls(harness, 'showLast')).toContainEqual([365]));
    // O histórico vai além do contexto padrão (150 velas antes do início): um ano antes do fim.
    const dailyFroms = harness
      .candleCalls()
      .filter((call) => call.query.get('timeframe') === '1d')
      .map((call) => Number(call.query.get('from')));
    expect(Math.min(...dailyFroms)).toBeLessThan(FIXTURE_FROM - 150 * 24 * HOUR);
    expect(screen.getByRole('button', { name: 'Último ano' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  test('"Todo o histórico" fits everything loaded, and choosing a candle by hand unmarks the period', async () => {
    const harness = showCandleCard({ marketTimeframes: ['1h', '4h', '1d'] });
    fireEvent.click(await screen.findByRole('button', { name: 'Todo o histórico' }));
    await waitFor(() => expect(surfaceCalls(harness, 'fit').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /^4h/ }));
    expect(
      screen.getByRole('button', { name: 'Todo o histórico' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  test('"Última semana" on the run candle frames 168 hours without switching', async () => {
    const harness = showCandleCard({ marketTimeframes: ['1h', '4h', '1d'] });
    fireEvent.click(await screen.findByRole('button', { name: 'Última semana' }));
    await waitFor(() => expect(surfaceCalls(harness, 'showLast')).toContainEqual([168]));
  });
});
