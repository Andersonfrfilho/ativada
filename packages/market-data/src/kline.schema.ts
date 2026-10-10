// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { Candle } from './candle.types.js';
import { DECIMAL_STRING_SCHEMA, TIMESTAMP_SCHEMA } from './decimal.schema.js';
import { MarketDataResponseError } from './market-data.error.js';
import type { Timeframe } from './timeframe.constant.js';

const decimalString = DECIMAL_STRING_SCHEMA;
const timestamp = TIMESTAMP_SCHEMA;

// Tupla posicional documentada pela Binance: 12 posições, as 5 últimas não são usadas aqui.
const klineRowSchema = z.tuple([
  timestamp,
  decimalString,
  decimalString,
  decimalString,
  decimalString,
  decimalString,
  timestamp,
  decimalString,
  z.number().int().nonnegative(),
  decimalString,
  decimalString,
  z.string(),
]);
const klinesResponseSchema = z.array(klineRowSchema);

export type ParseKlinesParams = {
  readonly body: unknown;
  readonly symbol: string;
  readonly timeframe: Timeframe;
};

export function parseKlinesResponse(params: ParseKlinesParams): readonly Candle[] {
  const parsed = klinesResponseSchema.safeParse(params.body);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join('.')).slice(0, 3);
    throw new MarketDataResponseError(
      `Resposta de klines fora do formato esperado (campos: ${paths.join(', ')}).`,
    );
  }
  return parsed.data.map((row): Candle => ({
    symbol: params.symbol,
    timeframe: params.timeframe,
    openTime: row[0],
    closeTime: row[6],
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
    volume: row[5],
    tradeCount: row[8],
  }));
}
