// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FetchImplementation } from '../../packages/market-data/src/market-data.types.js';
import { buildRawKline } from './fake-binance.fixture.js';

const DURATION_BY_INTERVAL: Readonly<Record<string, number>> = {
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};
const HTTP_SERVER_ERROR = 500;

export type GridCall = {
  readonly symbol: string;
  readonly interval: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly limit: number;
};

export type WithheldRange = {
  readonly interval: string;
  readonly fromOpenTime: number;
  readonly toOpenTime: number;
};

export type FakeBinanceGridOptions = {
  readonly now: number;
  readonly withheld?: readonly WithheldRange[];
  readonly delayMilliseconds?: number;
};

export type FakeBinanceGrid = {
  readonly fetchImplementation: FetchImplementation;
  readonly calls: GridCall[];
  readonly maxInFlight: () => number;
  failFromCall: number | undefined;
  failingSymbol: string | undefined;
};

function isWithheld(
  withheld: readonly WithheldRange[],
  interval: string,
  openTime: number,
): boolean {
  return withheld.some(
    (range) =>
      range.interval === interval && openTime >= range.fromOpenTime && openTime <= range.toOpenTime,
  );
}

function buildPage(call: GridCall, options: FakeBinanceGridOptions): readonly unknown[] {
  const duration = DURATION_BY_INTERVAL[call.interval] ?? 0;
  const currentOpenTime = Math.floor(options.now / duration) * duration;
  const firstOpenTime = Math.ceil(call.startTime / duration) * duration;
  const page: unknown[] = [];
  for (
    let openTime = firstOpenTime;
    openTime <= Math.min(call.endTime, currentOpenTime) && page.length < call.limit;
    openTime += duration
  ) {
    if (isWithheld(options.withheld ?? [], call.interval, openTime)) continue;
    page.push(
      buildRawKline({ openTime, durationMilliseconds: duration, index: openTime / duration }),
    );
  }
  return page;
}

function readCall(url: string): GridCall {
  const parameters = new URL(url).searchParams;
  return {
    symbol: parameters.get('symbol') ?? '',
    interval: parameters.get('interval') ?? '',
    startTime: Number(parameters.get('startTime') ?? 0),
    endTime: Number(parameters.get('endTime') ?? Number.MAX_SAFE_INTEGER),
    limit: Number(parameters.get('limit') ?? 500),
  };
}

// Serve uma grade completa (inclusive o candle ainda aberto, como a Binance) menos o que for retido.
export function createFakeBinanceGrid(options: FakeBinanceGridOptions): FakeBinanceGrid {
  const calls: GridCall[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const grid: FakeBinanceGrid = {
    calls,
    maxInFlight: (): number => maxInFlight,
    failFromCall: undefined,
    failingSymbol: undefined,
    fetchImplementation: async (url) => {
      const call = readCall(url);
      calls.push(call);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (options.delayMilliseconds !== undefined)
          await new Promise((resolve) => setTimeout(resolve, options.delayMilliseconds));
        const isFailing =
          (grid.failFromCall !== undefined && calls.length >= grid.failFromCall) ||
          grid.failingSymbol === call.symbol;
        if (isFailing) return new Response('{}', { status: HTTP_SERVER_ERROR });
        return new Response(JSON.stringify(buildPage(call, options)), { status: 200 });
      } finally {
        inFlight -= 1;
      }
    },
  };
  return grid;
}
