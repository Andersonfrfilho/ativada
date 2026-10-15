// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { DECIMAL_STRING_SCHEMA, TIMESTAMP_SCHEMA } from '../decimal.schema.js';
import { MALFORMED_REASON } from '../kline-stream.constant.js';
import type { MalformedReason } from '../kline-stream.types.js';
import { SYMBOL_PATTERN } from '../market-data.constant.js';
import { MINI_TICKER_EVENT_TYPE, MINI_TICKER_STREAM_SUFFIX } from './ticker.constant.js';
import { parseCandleEnvelope } from './ticker-candle.schema.js';
import type { RawCandle, RawTick } from './ticker.types.js';

// Campos documentados do `24hrMiniTicker` da Binance; o que não é usado aqui é descartado.
const envelopeSchema = z.object({
  stream: z.string(),
  data: z.object({
    e: z.literal(MINI_TICKER_EVENT_TYPE),
    E: TIMESTAMP_SCHEMA,
    s: z.string().regex(SYMBOL_PATTERN),
    c: DECIMAL_STRING_SCHEMA,
    o: DECIMAL_STRING_SCHEMA,
  }),
});

export type TickerMessage =
  | { readonly kind: 'tick'; readonly tick: RawTick }
  | { readonly kind: 'candle'; readonly candle: RawCandle }
  | { readonly kind: 'malformed'; readonly reason: MalformedReason };

function parseJson(text: string): { readonly isValid: boolean; readonly value: unknown } {
  try {
    return { isValid: true, value: JSON.parse(text) };
  } catch {
    return { isValid: false, value: undefined };
  }
}

// Entrada de terceiro: o motivo do descarte é um código fixo, nunca um trecho da mensagem.
export function parseTickerMessage(text: string): TickerMessage {
  const json = parseJson(text);
  if (!json.isValid) return { kind: 'malformed', reason: MALFORMED_REASON.INVALID_JSON };
  const candle = parseCandleEnvelope(json.value);
  if (candle !== undefined) return { kind: 'candle', candle };
  const parsed = envelopeSchema.safeParse(json.value);
  const isSameStream =
    parsed.success &&
    parsed.data.stream === `${parsed.data.data.s.toLowerCase()}${MINI_TICKER_STREAM_SUFFIX}`;
  if (!parsed.success || !isSameStream) {
    return { kind: 'malformed', reason: MALFORMED_REASON.UNKNOWN_SHAPE };
  }
  const { data } = parsed.data;
  return {
    kind: 'tick',
    tick: { symbol: data.s, price: data.c, openPrice: data.o, eventTime: data.E },
  };
}
