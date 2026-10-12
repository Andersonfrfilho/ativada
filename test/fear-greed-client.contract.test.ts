// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  MarketDataInvalidRequestError,
  MarketDataResponseError,
  MarketDataSourceError,
} from '../packages/market-data-crypto/src/index.js';
import { buildClient, failureOf } from './fixtures/fear-greed-client.fixture.js';
import {
  buildFearGreedBody,
  buildFearGreedItem,
  loadRealFearGreedResponse,
  type FearGreedReply,
} from './fixtures/fear-greed.fixture.js';

const SECRET_MARKER = 'segredo-que-nao-pode-vazar';

function bodyWith(item: Record<string, unknown>): FearGreedReply {
  return { status: 200, body: buildFearGreedBody([item]) };
}

describe('fear-greed client: the real alternative.me response', () => {
  test('parses the recorded fixture into five UTC dates with exact values, oldest first', async () => {
    const { client } = buildClient([{ status: 200, body: await loadRealFearGreedResponse() }]);
    const points = await client.fetchFearGreed({ limit: 5 });
    expect(points).toStrictEqual([
      { date: '2026-10-06', value: 73, classification: 'Greed' },
      { date: '2026-10-07', value: 71, classification: 'Greed' },
      { date: '2026-10-08', value: 64, classification: 'Greed' },
      { date: '2026-10-09', value: 59, classification: 'Greed' },
      { date: '2026-10-10', value: 64, classification: 'Greed' },
    ]);
  });

  test('time_until_update is optional: the item without it parses the same', async () => {
    const item = buildFearGreedItem({ value: '50', timestamp: '1791504000' });
    const withField = { ...item, time_until_update: '123' };
    const first = await buildClient([bodyWith(item)]).client.fetchFearGreed({ limit: 1 });
    const second = await buildClient([bodyWith(withField)]).client.fetchFearGreed({ limit: 1 });
    expect(first).toStrictEqual(second);
  });

  test('the timestamp is seconds: a mid-day second still lands on its UTC date', async () => {
    const item = buildFearGreedItem({ value: '10', timestamp: String(1791504000 + 86_399) });
    const [point] = await buildClient([bodyWith(item)]).client.fetchFearGreed({ limit: 1 });
    expect(point?.date).toBe('2026-10-09');
  });

  test('two items on the same date keep the most recent timestamp', async () => {
    const morning = buildFearGreedItem({ value: '10', timestamp: '1791504000' });
    const evening = buildFearGreedItem({ value: '20', timestamp: String(1791504000 + 43_200) });
    const body = buildFearGreedBody([evening, morning]);
    const points = await buildClient([{ status: 200, body }]).client.fetchFearGreed({ limit: 2 });
    expect(points).toStrictEqual([{ date: '2026-10-09', value: 20, classification: 'Neutral' }]);
  });
});

describe('fear-greed client: third-party responses are never trusted', () => {
  test.each([
    ['value above 100', buildFearGreedItem({ value: '101', timestamp: '1791504000' })],
    ['value below 0', buildFearGreedItem({ value: '-1', timestamp: '1791504000' })],
    ['non numeric value', buildFearGreedItem({ value: SECRET_MARKER, timestamp: '1791504000' })],
    ['fractional value', buildFearGreedItem({ value: '50.5', timestamp: '1791504000' })],
    [
      'numeric (not string) value',
      { ...buildFearGreedItem({ value: '5', timestamp: '1791504000' }), value: 5 },
    ],
    ['non numeric timestamp', buildFearGreedItem({ value: '50', timestamp: SECRET_MARKER })],
    ['absurd timestamp', buildFearGreedItem({ value: '50', timestamp: '99999999999999999' })],
    ['missing classification', { value: '50', timestamp: '1791504000' }],
  ])('%s -> typed response error that does not echo the body', async (_name, item) => {
    const failure = await failureOf(bodyWith(item));
    expect(failure).toBeInstanceOf(MarketDataResponseError);
    expect((failure as Error).message).not.toContain(SECRET_MARKER);
  });

  test('metadata.error filled -> typed source error without echoing it', async () => {
    const item = buildFearGreedItem({ value: '50', timestamp: '1791504000' });
    const body = buildFearGreedBody([item], SECRET_MARKER);
    const failure = await failureOf({ status: 200, body });
    expect(failure).toBeInstanceOf(MarketDataSourceError);
    expect((failure as Error).message).not.toContain(SECRET_MARKER);
  });

  test('a body that is not JSON -> typed response error without echo', async () => {
    const failure = await failureOf({ status: 200, rawBody: `<html>${SECRET_MARKER}</html>` });
    expect(failure).toBeInstanceOf(MarketDataResponseError);
    expect((failure as Error).message).not.toContain(SECRET_MARKER);
  });

  test.each([[{}], [[]], [{ data: 'x', metadata: { error: null } }]])(
    'envelope %j -> typed response error',
    async (body) => {
      expect(await failureOf({ status: 200, body })).toBeInstanceOf(MarketDataResponseError);
    },
  );

  test('limit must be a non negative integer', async () => {
    const { client } = buildClient([{ status: 200, body: buildFearGreedBody([]) }]);
    for (const limit of [-1, 1.5, Number.NaN])
      expect(
        await client.fetchFearGreed({ limit }).catch((error: unknown) => error),
      ).toBeInstanceOf(MarketDataInvalidRequestError);
  });
});
