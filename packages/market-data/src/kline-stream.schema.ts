// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { Candle } from './candle.types.js';
import { DECIMAL_STRING_SCHEMA, TIMESTAMP_SCHEMA } from './decimal.schema.js';
import { KLINE_EVENT_TYPE, MALFORMED_REASON } from './kline-stream.constant.js';
import { SYMBOL_PATTERN } from './market-data.constant.js';
import { TIMEFRAME } from './timeframe.constant.js';

// Campos documentados do payload `kline` da Binance; o que não é usado aqui é descartado.
const klineSchema = z.object({
  t: TIMESTAMP_SCHEMA,
  T: TIMESTAMP_SCHEMA,
  s: z.string().regex(SYMBOL_PATTERN),
  i: z.enum(TIMEFRAME),
  o: DECIMAL_STRING_SCHEMA,
  c: DECIMAL_STRING_SCHEMA,
  h: DECIMAL_STRING_SCHEMA,
  l: DECIMAL_STRING_SCHEMA,
  v: DECIMAL_STRING_SCHEMA,
  n: z.number().int().nonnegative(),
  x: z.boolean(),
});

const envelopeSchema = z.object({
  stream: z.string(),
  data: z.object({
    e: z.literal(KLINE_EVENT_TYPE),
    E: TIMESTAMP_SCHEMA,
    s: z.string().regex(SYMBOL_PATTERN),
    k: klineSchema,
  }),
});

type MalformedReason = (typeof MALFORMED_REASON)[keyof typeof MALFORMED_REASON];

export type KlineMessage =
  | { readonly kind: 'closed'; readonly candle: Candle }
  | { readonly kind: 'open' }
  | { readonly kind: 'malformed'; readonly reason: MalformedReason };

function parseJson(text: string): { readonly isValid: boolean; readonly value: unknown } {
  try {
    return { isValid: true, value: JSON.parse(text) };
  } catch {
    return { isValid: false, value: undefined };
  }
}

// Entrada de terceiro: o motivo do descarte é um código fixo, nunca um trecho da mensagem.
export function parseKlineMessage(text: string): KlineMessage {
  const json = parseJson(text);
  if (!json.isValid) return { kind: 'malformed', reason: MALFORMED_REASON.INVALID_JSON };
  const parsed = envelopeSchema.safeParse(json.value);
  if (!parsed.success || parsed.data.data.s !== parsed.data.data.k.s) {
    return { kind: 'malformed', reason: MALFORMED_REASON.UNKNOWN_SHAPE };
  }
  const kline = parsed.data.data.k;
  // Constituição §3: candle aberto muda a cada tick e nunca vira candle fechado.
  if (!kline.x) return { kind: 'open' };
  return {
    kind: 'closed',
    candle: {
      symbol: kline.s,
      timeframe: kline.i,
      openTime: kline.t,
      closeTime: kline.T,
      open: kline.o,
      high: kline.h,
      low: kline.l,
      close: kline.c,
      volume: kline.v,
      tradeCount: kline.n,
    },
  };
}
