// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

import { ApiError } from '../src/http/api.error.js';
import { createApiClient } from '../src/http/api-client.js';
import {
  queryRetryDelay,
  rateLimitDelaySeconds,
  shouldRetryQuery,
} from '../src/http/rate-limit.js';
import { createSessionService } from '../src/session/session-service.js';
import { dataResponse, createFakeAccessToken, createFakeFetch } from './support/fake-fetch.js';
import { z } from '@ativada/environment';
import {
  buildCandlesBetween,
  showCandleCard,
  timeframeStep,
} from './support/candle-card-harness.js';

const WAIT = { timeout: 5_000 };

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function tooManyRequests(retryAfter: string | undefined): Response {
  const headers = retryAfter === undefined ? {} : { 'Retry-After': retryAfter };
  return Response.json(
    { error: { code: 'RATE_LIMITED', message: 'Muitos pedidos.' } },
    { status: 429, headers },
  );
}

describe('rate limit helpers', () => {
  test('backoff grows to a ceiling and Retry-After wins', () => {
    expect(
      [1, 2, 3, 4, 5, 6].map((count) => rateLimitDelaySeconds(count, undefined)),
    ).toStrictEqual([2, 4, 8, 16, 30, 30]);
    expect(rateLimitDelaySeconds(1, 7)).toBe(7);
    expect(rateLimitDelaySeconds(1, 900)).toBe(60);
  });

  test('a 429 retries several times, another failure only once', () => {
    const limited = new ApiError({ status: 429, code: 'X', message: 'x', retryAfterSeconds: 3 });
    const broken = new ApiError({ status: 500, code: 'X', message: 'x' });
    expect(shouldRetryQuery(4, limited)).toBe(true);
    expect(shouldRetryQuery(5, limited)).toBe(false);
    expect(shouldRetryQuery(0, broken)).toBe(true);
    expect(shouldRetryQuery(1, broken)).toBe(false);
    expect(queryRetryDelay(1, limited)).toBe(3_000);
  });

  test('the api client keeps the Retry-After header on the error', async () => {
    const calls = createFakeFetch([
      {
        method: 'POST',
        path: '/v1/session/refresh',
        respond: (): Response =>
          dataResponse({ accessToken: createFakeAccessToken({ n: 1 }), expiresIn: 300 }),
      },
      { method: 'GET', path: '/v1/thing', respond: (): Response => tooManyRequests('12') },
    ]);
    const session = createSessionService({ fetchImplementation: calls.fetch, now: () => 0 });
    const client = createApiClient({ fetchImplementation: calls.fetch, session });
    const failure = await client
      .request({ path: '/v1/thing', schema: z.object({ id: z.string() }) })
      .catch((error: unknown) => error);
    expect(failure instanceof ApiError && failure.retryAfterSeconds).toBe(12);
  });
});

describe('candle chart: 429 never leaves the canvas empty', () => {
  test('shows the friendly notice with the countdown and recovers on its own', async () => {
    let isLimited = true;
    const harness = showCandleCard({
      respondCandles: (call) => {
        if (isLimited) return tooManyRequests('1');
        const step = timeframeStep(call.query.get('timeframe'));
        return dataResponse(
          buildCandlesBetween(Number(call.query.get('from')), Number(call.query.get('to')), step),
        );
      },
    });
    expect(await screen.findByText(/Muitas consultas em pouco tempo/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeDefined();
    isLimited = false;
    await waitFor(() => {
      expect(harness.surfaces.some((surface) => surface.callsOf('setCandles').length > 0)).toBe(
        true,
      );
    }, WAIT);
    expect(screen.queryByText(/Muitas consultas em pouco tempo/)).toBeNull();
  });

  test('without Retry-After it still counts down and the button asks again right away', async () => {
    let calls = 0;
    const harness = showCandleCard({
      respondCandles: () => {
        calls += 1;
        return tooManyRequests(undefined);
      },
    });
    expect(await screen.findByText(/Tentando de novo em \d+ s/)).toBeDefined();
    const before = calls;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(calls).toBeGreaterThan(before), WAIT);
    expect(harness.surfaces).toHaveLength(0);
  });

  test('an empty closed history is told, not drawn as a blank chart', async () => {
    showCandleCard({ respondCandles: () => dataResponse([]) });
    expect(await screen.findByText(/Nenhuma vela fechada chegou/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeDefined();
  });

  test('a layer 429 keeps the candles on the screen', async () => {
    const harness = showCandleCard({ respondLayers: () => tooManyRequests('1') });
    await waitFor(() => {
      expect(harness.surfaces.some((surface) => surface.callsOf('setCandles').length > 0)).toBe(
        true,
      );
    }, WAIT);
  });
});
