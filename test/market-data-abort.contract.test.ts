// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createCancellableSleep,
  createMarketDataClient,
  MarketDataAbortedError,
  TIMEFRAME,
  TIMEFRAME_DURATION_MILLISECONDS,
  type FetchImplementation,
} from '../packages/market-data/src/index.js';
import {
  buildSyntheticSeries,
  createScriptedFetch,
  createSeriesFetch,
} from './fixtures/fake-binance.fixture.js';
import { waitFor } from './fixtures/wait-for.fixture.js';

const BASE_URL = 'https://market-data.test';
const SYMBOL = 'BTCUSDT';
const FIRST_OPEN_TIME = 1_735_689_600_000;
const FAR_FUTURE_MILLISECONDS = 4_000_000_000_000;
const ONE_HOUR = TIMEFRAME_DURATION_MILLISECONDS[TIMEFRAME.ONE_HOUR];
const PROMPT_MILLISECONDS = 1_000;

async function settleWithin(attempt: Promise<unknown>): Promise<unknown> {
  const hung = Symbol('hung');
  const outcome = await Promise.race([
    attempt.catch((error: unknown) => error),
    Bun.sleep(PROMPT_MILLISECONDS).then(() => hung),
  ]);
  return outcome === hung ? 'HUNG' : outcome;
}

describe('REST client: cancellation by AbortSignal', () => {
  test('aborting during a 429 Retry-After wait ends the call at once', async () => {
    const controller = new AbortController();
    const { fetchImplementation, calls } = createScriptedFetch([
      { status: 429, headers: { 'retry-after': '300' } },
    ]);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      signal: controller.signal,
    });
    const attempt = client.fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR });
    await Bun.sleep(20);
    controller.abort();
    expect(await settleWithin(attempt)).toBeInstanceOf(MarketDataAbortedError);
    expect(calls).toHaveLength(1);
  });

  test('aborting while a request is in flight cancels it, as an abort and not as a network failure', async () => {
    const controller = new AbortController();
    let isRequestInFlight = false;
    const hangingFetch: FetchImplementation = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        isRequestInFlight = true;
        init.signal.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          {
            once: true,
          },
        );
      });
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation: hangingFetch,
      signal: controller.signal,
    });
    const attempt = client.fetchKlines({ symbol: SYMBOL, timeframe: TIMEFRAME.ONE_HOUR });
    await waitFor(() => isRequestInFlight, 'request in flight');
    controller.abort();
    expect(await settleWithin(attempt)).toBeInstanceOf(MarketDataAbortedError);
  });

  test('an already aborted signal makes no request at all', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetchImplementation, calls } = createScriptedFetch([{ status: 200, body: [] }]);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      signal: controller.signal,
    });
    expect(
      await settleWithin(client.fetchKlines({ symbol: SYMBOL, timeframe: '1h' })),
    ).toBeInstanceOf(MarketDataAbortedError);
    expect(calls).toHaveLength(0);
  });

  test('fetchKlinesRange checks the signal between pages', async () => {
    const controller = new AbortController();
    const series = buildSyntheticSeries({
      firstOpenTime: FIRST_OPEN_TIME,
      durationMilliseconds: ONE_HOUR,
      count: 2_500,
    });
    const { fetchImplementation, calls } = createSeriesFetch(series);
    const client = createMarketDataClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      now: () => FAR_FUTURE_MILLISECONDS,
      signal: controller.signal,
    });
    const outcome = await client
      .fetchKlinesRange({
        symbol: SYMBOL,
        timeframe: TIMEFRAME.ONE_HOUR,
        from: FIRST_OPEN_TIME,
        to: FIRST_OPEN_TIME + 2_499 * ONE_HOUR,
        onPage: () => {
          controller.abort();
          return Promise.resolve();
        },
      })
      .catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(MarketDataAbortedError);
    expect(calls).toHaveLength(1);
  });
});

describe('cancellable sleep', () => {
  test('cancelAll wakes every pending sleep instead of leaving it hanging', async () => {
    const cancellable = createCancellableSleep();
    const pending = [cancellable.sleep(60_000), cancellable.sleep(120_000)];
    cancellable.cancelAll();
    const outcome = await Promise.race([
      Promise.all(pending).then(() => 'woken'),
      Bun.sleep(PROMPT_MILLISECONDS).then(() => 'hung'),
    ]);
    expect(outcome).toBe('woken');
  });
});
