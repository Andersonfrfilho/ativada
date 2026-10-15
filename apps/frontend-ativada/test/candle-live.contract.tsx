// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { STREAM_STATUS } from '../src/live/stream.constant.js';
import type { StreamCandle } from '../src/live/stream.validation.js';
import { buildFixtureChart, FIXTURE_DAY } from './fixtures/trade-chart.fixture.js';
import type { FakeChartSurface } from './support/fake-chart-surface.js';
import { dataResponse } from './support/fake-fetch.js';
import {
  FIXTURE_FROM,
  FIXTURE_HOUR,
  showCandleCard,
  type CandleCardHarness,
  type CandleCardOptions,
} from './support/candle-card-harness.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// A vela em formação começa onde a última fechada termina: 40 dias depois do início da execução.
const RUN_END = FIXTURE_FROM + 40 * FIXTURE_DAY;

function forming(overrides: Partial<StreamCandle> = {}): StreamCandle {
  return {
    type: 'candle',
    symbol: 'BNBUSDT',
    timeframe: '1h',
    openTime: RUN_END,
    open: '650.00',
    high: '652.50',
    low: '649.00',
    close: '651.25',
    volume: '120.5',
    closed: false,
    at: RUN_END + 1_000,
    ...overrides,
  };
}

function openLive(options: CandleCardOptions = {}): CandleCardHarness {
  return showCandleCard({ kind: 'live_paper', ...options });
}

async function ready(harness: CandleCardHarness): Promise<FakeChartSurface> {
  act(() => harness.app.stream.setStatus(STREAM_STATUS.LIVE));
  await waitFor(() =>
    expect(
      harness.surfaces.find((candidate) => !candidate.isDestroyed())?.callsOf('setCandles').length,
    ).toBeGreaterThan(0),
  );
  const surface = harness.surfaces.find((candidate) => !candidate.isDestroyed());
  if (surface === undefined) throw new Error('nenhuma superfície viva');
  return surface;
}

function liveCandles(surface: FakeChartSurface): readonly unknown[] {
  return surface.callsOf('setLiveCandle').map((call) => call[0]);
}

describe('vela em formação (D9)', () => {
  test('a candle message draws the open candle and nothing else: the closed candles, score and lines stay', async () => {
    const harness = openLive();
    const surface = await ready(harness);
    await waitFor(() => expect(surface.callsOf('setScore').length).toBeGreaterThan(0));
    const closedCalls = surface.callsOf('setCandles').length;
    const scoreCalls = surface.callsOf('setScore').length;
    act(() => harness.app.stream.candle(forming()));
    await waitFor(() =>
      expect(liveCandles(surface).at(-1)).toStrictEqual({
        time: RUN_END / 1_000,
        open: 650,
        high: 652.5,
        low: 649,
        close: 651.25,
      }),
    );
    expect(surface.callsOf('setCandles')).toHaveLength(closedCalls);
    expect(surface.callsOf('setScore')).toHaveLength(scoreCalls);
    act(() =>
      harness.app.stream.candle(forming({ close: '653.00', high: '653.00', at: RUN_END + 2_000 })),
    );
    await waitFor(() =>
      expect(liveCandles(surface).at(-1)).toMatchObject({ close: 653, high: 653 }),
    );
  });

  test('the legend says the candle is forming and shows its volume', async () => {
    const harness = openLive();
    await ready(harness);
    act(() => harness.app.stream.candle(forming()));
    expect(await screen.findByText('em formação')).toBeDefined();
    expect(screen.getByText('651,25')).toBeDefined();
  });

  test('another pair, another candle size and an older message are ignored', async () => {
    const harness = openLive();
    const surface = await ready(harness);
    act(() => harness.app.stream.candle(forming()));
    await waitFor(() => expect(liveCandles(surface).at(-1)).toMatchObject({ close: 651.25 }));
    act(() => {
      harness.app.stream.candle(forming({ symbol: 'ETHUSDT', close: '1.00' }));
      harness.app.stream.candle(forming({ timeframe: '4h', close: '2.00' }));
      harness.app.stream.candle(forming({ openTime: RUN_END - FIXTURE_HOUR, close: '3.00' }));
      harness.app.stream.candle(forming({ close: '4.00', at: RUN_END + 500 }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(liveCandles(surface).at(-1)).toMatchObject({ close: 651.25 });
  });

  test('a closed candle message takes the forming candle off the chart', async () => {
    const harness = openLive();
    const surface = await ready(harness);
    act(() => harness.app.stream.candle(forming()));
    await waitFor(() => expect(liveCandles(surface).at(-1)).not.toBeNull());
    act(() => harness.app.stream.candle(forming({ closed: true, at: RUN_END + 3_000 })));
    await waitFor(() => expect(liveCandles(surface).at(-1)).toBeNull());
  });

  test('a backtest and a fixed range never draw the forming candle', async () => {
    const backtest = showCandleCard();
    const backtestSurface = await ready(backtest);
    act(() => backtest.app.stream.candle(forming()));
    await act(async () => {
      await Promise.resolve();
    });
    expect(liveCandles(backtestSurface).every((candle) => candle === null)).toBe(true);
    cleanup();
    const to = new Date(RUN_END - 2 * FIXTURE_HOUR).toISOString();
    const fixed = openLive({ search: `?de=${new Date(FIXTURE_FROM).toISOString()}&ate=${to}` });
    const fixedSurface = await ready(fixed);
    act(() => fixed.app.stream.candle(forming()));
    await act(async () => {
      await Promise.resolve();
    });
    expect(liveCandles(fixedSurface).every((candle) => candle === null)).toBe(true);
  });

  test('when the price stops arriving the candle leaves and the screen says "sem dados"', async () => {
    const harness = openLive({ silenceMilliseconds: 50 });
    const surface = await ready(harness);
    act(() => harness.app.stream.candle(forming()));
    await waitFor(() => expect(liveCandles(surface).at(-1)).not.toBeNull());
    expect(
      await screen.findByText(/Sem dados ao vivo há \d+ s/, undefined, { timeout: 3_500 }),
    ).toBeDefined();
    expect(liveCandles(surface).at(-1)).toBeNull();
    act(() => harness.app.stream.candle(forming({ at: RUN_END + 9_000, close: '655.00' })));
    await waitFor(() => expect(liveCandles(surface).at(-1)).toMatchObject({ close: 655 }));
    expect(screen.queryByText(/Sem dados ao vivo/)).toBeNull();
  });
});

describe('vela fechada pelo aviso do stream', () => {
  test('the notice refetches the run and the page asks for the candle that closed, joining it to the end', async () => {
    let end = RUN_END;
    const harness = openLive({
      respondChart: () =>
        dataResponse(
          buildFixtureChart({
            from: FIXTURE_FROM,
            to: end,
            runRange: { from: FIXTURE_FROM, to: end },
            lastClosedCandleTime: end - FIXTURE_HOUR,
          }),
        ),
    });
    const surface = await ready(harness);
    expect(harness.candleCalls()).toHaveLength(1);
    const closedBefore = surface.callsOf('setCandles').at(-1)?.[0];
    expect(Array.isArray(closedBefore) ? closedBefore.length : 0).toBe(960);
    act(() => harness.app.stream.candle(forming()));
    end += FIXTURE_HOUR;
    act(() =>
      harness.app.stream.emit({
        type: 'event',
        runId: 'run-1',
        kind: 'fill',
        eventId: 'e1',
        at: end,
      }),
    );
    await waitFor(() => expect(harness.candleCalls()).toHaveLength(2));
    const tail = harness.candleCalls()[1];
    expect(tail?.query.get('from')).toBe(String(RUN_END));
    expect(tail?.query.get('to')).toBe(String(end));
    await waitFor(() => {
      const closedAfter = surface.callsOf('setCandles').at(-1)?.[0];
      expect(Array.isArray(closedAfter) ? closedAfter.length : 0).toBe(961);
    });
  });

  test('with a fixed range the "new candles" notice shows and takes the chart back to the end', async () => {
    const harness = openLive({
      search: `?de=${new Date(FIXTURE_FROM).toISOString()}&ate=${new Date(RUN_END - 3 * FIXTURE_HOUR).toISOString()}`,
    });
    await ready(harness);
    const button = await screen.findByRole('button', { name: 'Há velas novas — ir para o fim' });
    fireEvent.click(button);
    await waitFor(() => expect(harness.router.state.location.search).toBe(''));
    await waitFor(() => expect(harness.candleCalls().length).toBeGreaterThan(1));
    expect(harness.candleCalls().at(-1)?.query.get('to')).toBe(String(RUN_END));
  });

  test('a live run with no candle processed yet says when the first one closes instead of loading forever', async () => {
    const periodStart = FIXTURE_FROM + 41 * FIXTURE_DAY;
    const harness = openLive({
      runOverrides: { status: 'running', periodStart, lastCandleTime: null, finishedAt: null },
      build: (overrides) => ({
        ...buildFixtureChart(overrides),
        runRange: { from: periodStart, to: periodStart },
      }),
    });
    expect(await screen.findByText('Ainda não há velas para mostrar.')).toBeDefined();
    expect(
      await screen.findByText(/Aguardando a primeira vela, que (fecha|fechou) às /),
    ).toBeDefined();
    expect(screen.queryByText('Carregando as velas…')).toBeNull();
    expect(harness.candleCalls()).toHaveLength(0);
  });
});
