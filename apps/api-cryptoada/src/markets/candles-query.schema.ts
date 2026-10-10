// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';
import {
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineTimeframe,
} from '@cryptoada/strategy-engine';

import {
  CANDLE_QUERY_REASON,
  MAX_CANDLES_PER_RESPONSE,
  TIMESTAMP_PATTERN,
} from './markets.constant.js';

export type EnabledMarkets = {
  readonly symbols: readonly string[];
  readonly timeframes: readonly string[];
};

export type CandlesQuery = {
  readonly symbol: string;
  readonly timeframe: EngineTimeframe;
  readonly from: number;
  readonly to: number;
};

const timestampSchema = z.string().regex(TIMESTAMP_PATTERN).transform(Number);

// `from` incluído e `to` excluído, em milissegundos. Símbolo e timeframe só os habilitados no ambiente, e o intervalo
// cabe em `MAX_CANDLES_PER_RESPONSE` candles da grade do timeframe.
export function createCandlesQuerySchema(enabled: EnabledMarkets): z.ZodType<CandlesQuery> {
  return z
    .strictObject({
      symbol: z.string().refine((symbol) => enabled.symbols.includes(symbol), {
        error: CANDLE_QUERY_REASON.NOT_ENABLED,
      }),
      timeframe: z
        .enum(ENGINE_TIMEFRAME)
        .refine((timeframe) => enabled.timeframes.includes(timeframe), {
          error: CANDLE_QUERY_REASON.NOT_ENABLED,
        }),
      from: timestampSchema,
      to: timestampSchema,
    })
    .superRefine((query, context) => {
      if (query.to <= query.from) {
        context.addIssue({
          code: 'custom',
          path: ['to'],
          message: CANDLE_QUERY_REASON.MUST_BE_AFTER_FROM,
        });
        return;
      }
      const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[query.timeframe];
      if (Math.ceil((query.to - query.from) / duration) > MAX_CANDLES_PER_RESPONSE) {
        context.addIssue({
          code: 'custom',
          path: ['to'],
          message: CANDLE_QUERY_REASON.RANGE_TOO_LARGE,
        });
      }
    });
}
