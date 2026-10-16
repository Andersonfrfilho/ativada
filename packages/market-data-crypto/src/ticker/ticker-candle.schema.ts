// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { DECIMAL_STRING_SCHEMA, TIMESTAMP_SCHEMA } from '../decimal.schema.js';
import { KLINE_EVENT_TYPE, KLINE_STREAM_SUFFIX } from '../kline-stream.constant.js';
import { SYMBOL_PATTERN } from '../market-data.constant.js';
import { MARKET_CANDLE_TIMEFRAME } from '../timeframe.constant.js';
import type { RawCandle } from './ticker.types.js';

// Campos documentados do `kline` da Binance; o que não é usado aqui é descartado. A vela ABERTA também é lida (`x` falso):
// aqui ela só vira o desenho da vela em formação, nunca é gravada (quem grava é o worker, só com `x` verdadeiro).
const candleEnvelopeSchema = z.object({
  stream: z.string(),
  data: z.object({
    e: z.literal(KLINE_EVENT_TYPE),
    E: TIMESTAMP_SCHEMA,
    s: z.string().regex(SYMBOL_PATTERN),
    k: z.object({
      t: TIMESTAMP_SCHEMA,
      s: z.string().regex(SYMBOL_PATTERN),
      i: z.enum(MARKET_CANDLE_TIMEFRAME),
      o: DECIMAL_STRING_SCHEMA,
      h: DECIMAL_STRING_SCHEMA,
      l: DECIMAL_STRING_SCHEMA,
      c: DECIMAL_STRING_SCHEMA,
      v: DECIMAL_STRING_SCHEMA,
      x: z.boolean(),
    }),
  }),
});

// `undefined` = não é uma vela da forma esperada (o nome do stream precisa ser o do par e da vela do próprio payload).
export function parseCandleEnvelope(value: unknown): RawCandle | undefined {
  const parsed = candleEnvelopeSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { stream, data } = parsed.data;
  const { k } = data;
  const isSameStream = stream === `${k.s.toLowerCase()}${KLINE_STREAM_SUFFIX}${k.i}`;
  if (!isSameStream || data.s !== k.s) return undefined;
  return {
    symbol: k.s,
    timeframe: k.i,
    openTime: k.t,
    open: k.o,
    high: k.h,
    low: k.l,
    close: k.c,
    volume: k.v,
    isClosed: k.x,
    eventTime: data.E,
  };
}
