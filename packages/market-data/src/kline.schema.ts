// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { Candle } from './candle.types.js';
import { DECIMAL_STRING_SCHEMA, TIMESTAMP_SCHEMA } from './decimal.schema.js';
import { MarketDataResponseError } from './market-data.error.js';
import { TIMEFRAME_DURATION_MILLISECONDS, type Timeframe } from './timeframe.constant.js';

const decimalString = DECIMAL_STRING_SCHEMA;
const timestamp = TIMESTAMP_SCHEMA;

// Tupla posicional documentada pela Binance: 12 posições, as 5 últimas não são usadas aqui.
// O resto (`z.unknown()`) deixa a Binance acrescentar colunas sem derrubar a leitura.
const klineRowSchema = z.tuple(
  [
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
  ],
  z.unknown(),
);
const klinesResponseSchema = z.array(klineRowSchema);

export type ParseKlinesParams = {
  readonly body: unknown;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly startTime?: number | undefined;
  readonly endTime?: number | undefined;
};

function describeGridViolation(
  candle: Candle,
  params: ParseKlinesParams,
  previous: number | undefined,
): string | undefined {
  const duration = TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  if (candle.closeTime !== candle.openTime + duration - 1) return 'closeTime fora da grade';
  if (previous !== undefined && candle.openTime <= previous) return 'ordem não crescente';
  if (params.startTime !== undefined && candle.openTime < params.startTime)
    return 'antes de startTime';
  if (params.endTime !== undefined && candle.openTime > params.endTime) return 'depois de endTime';
  return undefined;
}

// Linha fora da grade não é gravada: o erro nomeia a regra, nunca ecoa o corpo.
function assertOnGrid(candles: readonly Candle[], params: ParseKlinesParams): void {
  let previous: number | undefined;
  for (const candle of candles) {
    const violation = describeGridViolation(candle, params, previous);
    if (violation !== undefined) {
      throw new MarketDataResponseError(
        `Resposta de klines fora da grade do timeframe (${violation}).`,
      );
    }
    previous = candle.openTime;
  }
}

export function parseKlinesResponse(params: ParseKlinesParams): readonly Candle[] {
  const parsed = klinesResponseSchema.safeParse(params.body);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join('.')).slice(0, 3);
    throw new MarketDataResponseError(
      `Resposta de klines fora do formato esperado (campos: ${paths.join(', ')}).`,
    );
  }
  const candles = parsed.data.map((row): Candle => ({
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
  assertOnGrid(candles, params);
  return candles;
}
