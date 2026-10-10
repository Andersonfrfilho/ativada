// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createFearGreedClient,
  type FearGreedClient,
} from '../../packages/market-data/src/index.js';
import { createFakeClock, type FakeClock } from './fake-binance.fixture.js';
import {
  createFearGreedFetch,
  FEAR_GREED_BASE_URL,
  type FearGreedReply,
  type RecordedFearGreedCall,
} from './fear-greed.fixture.js';

export function buildClient(
  script: readonly FearGreedReply[],
  overrides: Record<string, number> = {},
): { client: FearGreedClient; clock: FakeClock; calls: RecordedFearGreedCall[] } {
  const clock = createFakeClock(0);
  const scripted = createFearGreedFetch(script);
  const client = createFearGreedClient({
    baseUrl: FEAR_GREED_BASE_URL,
    fetchImplementation: scripted.fetchImplementation,
    sleep: clock.sleep,
    maxAttempts: 3,
    backoffBaseMilliseconds: 100,
    backoffMaxMilliseconds: 150,
    ...overrides,
  });
  return { client, clock, calls: scripted.calls };
}

export async function failureOf(reply: FearGreedReply): Promise<unknown> {
  const { client } = buildClient([reply], { maxAttempts: 1 });
  return client.fetchFearGreed({ limit: 5 }).catch((error: unknown) => error);
}
