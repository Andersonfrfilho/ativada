// Copyright (c) 2026 Ada Technology. All rights reserved.
import { TIMEFRAME_DURATION_MILLISECONDS, type Timeframe } from '../src/index.js';

const DEFAULT_PAGE_LIMIT = 500;
const PRICE_CYCLE = 50;

export type KlineEventParams = {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly openTime: number;
  readonly isClosed: boolean;
};

export type MiniTickerEventParams = {
  readonly symbol: string;
  readonly price: string;
  readonly openPrice: string;
  readonly eventTime: number;
};

// O `<par>@miniTicker` da Binance: o preço corrente (`c`) e o de abertura da janela de 24 h (`o`).
export function buildMiniTickerEvent(
  params: MiniTickerEventParams,
): Readonly<Record<string, unknown>> {
  return {
    stream: `${params.symbol.toLowerCase()}@miniTicker`,
    data: {
      e: '24hrMiniTicker',
      E: params.eventTime,
      s: params.symbol,
      c: params.price,
      o: params.openPrice,
      h: params.price,
      l: params.openPrice,
      v: '10000.00000000',
      q: '18.00000000',
    },
  };
}

export type KlinesRestRequest = {
  readonly symbol: string;
  readonly interval: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly limit: number;
};

// Preço determinístico por abertura: o teste calcula o valor esperado sem tabela.
export function buildFakePrice(params: {
  readonly openTime: number;
  readonly timeframe: Timeframe;
}): string {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  return `${100 + ((params.openTime / duration) % PRICE_CYCLE)}.12345678`;
}

export function buildKlineEvent(params: KlineEventParams): Readonly<Record<string, unknown>> {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  const price = buildFakePrice(params);
  return {
    stream: `${params.symbol.toLowerCase()}@kline_${params.timeframe}`,
    data: {
      e: 'kline',
      E: params.openTime + duration + 5,
      s: params.symbol,
      k: {
        t: params.openTime,
        T: params.openTime + duration - 1,
        s: params.symbol,
        i: params.timeframe,
        f: 100,
        L: 200,
        o: price,
        c: price,
        h: price,
        l: price,
        v: '12.50000000',
        n: 7,
        x: params.isClosed,
        q: '1250.00000000',
        V: '6.00000000',
        Q: '600.00000000',
        B: '0',
      },
    },
  };
}

export function buildRestRow(params: Omit<KlineEventParams, 'isClosed'>): readonly unknown[] {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  const price = buildFakePrice(params);
  return [
    params.openTime,
    price,
    price,
    price,
    price,
    '12.50000000',
    params.openTime + duration - 1,
    '1250.00000000',
    7,
    '6.00000000',
    '600.00000000',
    '0',
  ];
}

export function readRestRequest(url: URL): KlinesRestRequest {
  const parameters = url.searchParams;
  return {
    symbol: parameters.get('symbol') ?? '',
    interval: parameters.get('interval') ?? '',
    startTime: Number(parameters.get('startTime') ?? 0),
    endTime: Number(parameters.get('endTime') ?? Number.MAX_SAFE_INTEGER),
    limit: Number(parameters.get('limit') ?? DEFAULT_PAGE_LIMIT),
  };
}
