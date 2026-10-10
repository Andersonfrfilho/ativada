// Copyright (c) 2026 Ada Technology. All rights reserved.
import { KLINES_PATH, MAX_KLINES_PER_REQUEST, SYMBOL_PATTERN } from './market-data.constant.js';
import { MarketDataInvalidRequestError } from './market-data.error.js';
import type { FetchKlinesParams } from './market-data.types.js';
import { TIMEFRAME_DURATION_MILLISECONDS } from './timeframe.constant.js';

function assertTimestamp(name: string, value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MarketDataInvalidRequestError(`${name} deve ser um inteiro em milissegundos.`);
  }
}

export function assertValidKlinesParams(params: FetchKlinesParams): void {
  if (!SYMBOL_PATTERN.test(params.symbol)) {
    throw new MarketDataInvalidRequestError('symbol deve conter só letras maiúsculas e dígitos.');
  }
  if (!(params.timeframe in TIMEFRAME_DURATION_MILLISECONDS)) {
    throw new MarketDataInvalidRequestError('timeframe não suportado.');
  }
  assertTimestamp('startTime', params.startTime);
  assertTimestamp('endTime', params.endTime);
  const { limit } = params;
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit < 1 || limit > MAX_KLINES_PER_REQUEST)
  ) {
    throw new MarketDataInvalidRequestError(
      `limit deve estar entre 1 e ${MAX_KLINES_PER_REQUEST}.`,
    );
  }
}

export function buildKlinesUrl(baseUrl: string, params: FetchKlinesParams): string {
  const url = new URL(KLINES_PATH, baseUrl);
  url.searchParams.set('symbol', params.symbol);
  url.searchParams.set('interval', params.timeframe);
  if (params.startTime !== undefined) url.searchParams.set('startTime', String(params.startTime));
  if (params.endTime !== undefined) url.searchParams.set('endTime', String(params.endTime));
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  return url.toString();
}
