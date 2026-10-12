// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRecord, CandleRepository } from '../../packages/database/src/index.js';
import type { FakeBinanceStreamServer } from '../../packages/market-data-crypto/test-support/fake-binance-stream-server.js';
import { waitForSafeClock } from '../backfill-test/grid-oracle.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  EXCHANGE,
  MILLISECONDS_PER_HOUR,
  POLL_INTERVAL_MILLISECONDS,
  SYMBOL,
  TIMEFRAME,
  WAIT_TIMEOUT_MILLISECONDS,
} from './stream-test.constant.js';

export type StreamContext = {
  readonly databaseUrl: string;
  readonly repository: CandleRepository;
  readonly server: FakeBinanceStreamServer;
  // Abertura da última vela já fechada quando o cenário começa (a virada da hora é evitada antes).
  readonly lastClosedOpenTime: number;
};

export function computeLastClosedOpenTime(): number {
  return (
    Math.floor(Date.now() / MILLISECONDS_PER_HOUR) * MILLISECONDS_PER_HOUR - MILLISECONDS_PER_HOUR
  );
}

// Cada cenário começa longe da virada da hora; se a espera atravessou a virada, o banco semeado não vale mais.
export async function prepareScenario(context: StreamContext): Promise<void> {
  await waitForSafeClock();
  assertCondition(
    computeLastClosedOpenTime() === context.lastClosedOpenTime,
    'a hora virou entre os cenários: rode o stream-test de novo',
  );
}

export function reportCheck(message: string): void {
  console.log(`stream-test: ${message}`);
}

export function hoursFrom(openTime: number, hours: number): number {
  return openTime + hours * MILLISECONDS_PER_HOUR;
}

export function buildSeedCandle(openTime: number): CandleRecord {
  return {
    exchange: EXCHANGE,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    openTime,
    closeTime: openTime + MILLISECONDS_PER_HOUR - 1,
    open: '1.00000000',
    high: '1.00000000',
    low: '1.00000000',
    close: '1.00000000',
    volume: '1.00000000',
    tradeCount: 1,
  };
}

export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  description: string,
  timeoutMilliseconds: number = WAIT_TIMEOUT_MILLISECONDS,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await condition())) {
    assertCondition(Date.now() < deadline, `tempo esgotado esperando: ${description}`);
    await Bun.sleep(POLL_INTERVAL_MILLISECONDS);
  }
}

export async function readCandlesAt(
  context: StreamContext,
  openTime: number,
): Promise<readonly CandleRecord[]> {
  return context.repository.findCandles({
    exchange: EXCHANGE,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    from: openTime,
    to: openTime + MILLISECONDS_PER_HOUR,
  });
}
