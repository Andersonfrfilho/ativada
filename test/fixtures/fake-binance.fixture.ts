// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FetchImplementation } from '../../packages/market-data-crypto/src/market-data.types.js';

const RUNAWAY_SLEEP_LIMIT = 100;

export type ScriptedResponse =
  | {
      readonly status: number;
      readonly body?: unknown;
      readonly headers?: Readonly<Record<string, string>>;
    }
  | { readonly error: Error };

export type RecordedCall = { readonly url: URL; readonly signal: AbortSignal };

export type FakeClock = {
  readonly now: () => number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly sleeps: number[];
  readonly advance: (milliseconds: number) => void;
};

export function createFakeClock(startMilliseconds: number): FakeClock {
  let current = startMilliseconds;
  const sleeps: number[] = [];
  return {
    now: (): number => current,
    sleep: (milliseconds: number): Promise<void> => {
      // Laço de retry sem teto: falha o teste em vez de travar a suíte.
      if (sleeps.length >= RUNAWAY_SLEEP_LIMIT)
        return Promise.reject(new Error('runaway retry loop'));
      sleeps.push(milliseconds);
      current += milliseconds;
      return Promise.resolve();
    },
    sleeps,
    advance: (milliseconds: number): void => {
      current += milliseconds;
    },
  };
}

export function createScriptedFetch(script: readonly ScriptedResponse[]): {
  readonly fetchImplementation: FetchImplementation;
  readonly calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImplementation: FetchImplementation = (url, init) => {
    calls.push({ url: new URL(url), signal: init.signal });
    const scripted = script[Math.min(calls.length, script.length) - 1];
    if (scripted === undefined) return Promise.reject(new Error('empty script'));
    if ('error' in scripted) return Promise.reject(scripted.error);
    const headers = new Headers({ 'content-type': 'application/json', ...scripted.headers });
    return Promise.resolve(
      new Response(JSON.stringify(scripted.body ?? []), { status: scripted.status, headers }),
    );
  };
  return { fetchImplementation, calls };
}

export function buildRawKline(params: {
  readonly openTime: number;
  readonly durationMilliseconds: number;
  readonly index: number;
}): unknown[] {
  const price = `${100 + params.index}.50000000`;
  return [
    params.openTime,
    price,
    price,
    price,
    price,
    '1.00000000',
    params.openTime + params.durationMilliseconds - 1,
    '10.00000000',
    params.index + 1,
    '0.50000000',
    '5.00000000',
    '0',
  ];
}

export function buildSyntheticSeries(params: {
  readonly firstOpenTime: number;
  readonly durationMilliseconds: number;
  readonly count: number;
}): readonly (readonly unknown[])[] {
  return Array.from({ length: params.count }, (_unused, index) =>
    buildRawKline({
      openTime: params.firstOpenTime + index * params.durationMilliseconds,
      durationMilliseconds: params.durationMilliseconds,
      index,
    }),
  );
}

// Imita a Binance: filtra por startTime/endTime e corta em limit.
export function createSeriesFetch(series: readonly (readonly unknown[])[]): {
  readonly fetchImplementation: FetchImplementation;
  readonly calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImplementation: FetchImplementation = (url, init) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, signal: init.signal });
    const startTime = Number(parsed.searchParams.get('startTime') ?? 0);
    const endTime = Number(parsed.searchParams.get('endTime') ?? Number.MAX_SAFE_INTEGER);
    const limit = Number(parsed.searchParams.get('limit') ?? 500);
    const page = series
      .filter((row) => Number(row[0]) >= startTime && Number(row[0]) <= endTime)
      .slice(0, limit);
    return Promise.resolve(new Response(JSON.stringify(page), { status: 200 }));
  };
  return { fetchImplementation, calls };
}
