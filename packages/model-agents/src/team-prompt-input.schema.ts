// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

export const PROMPT_CANDLE_COUNT = 48;
export const PROMPT_TIMEFRAME = '15m';

const decimalTextSchema = z.string().regex(/^-?[0-9]+(\.[0-9]+)?$/);
const nullableDecimalTextSchema = decimalTextSchema.nullable();
const candleSchema = z.tuple([
  z.number().int().nonnegative(),
  decimalTextSchema,
  decimalTextSchema,
  decimalTextSchema,
  decimalTextSchema,
  decimalTextSchema,
]);

// Leituras públicas do analista naquela vela (spec 007); nulas durante o aquecimento.
const readingsSchema = z.strictObject({
  relativeVolume: nullableDecimalTextSchema,
  atrRate: nullableDecimalTextSchema,
  atrPercentile90: nullableDecimalTextSchema,
  atrPercentile95: nullableDecimalTextSchema,
  momentumShort: nullableDecimalTextSchema,
  momentumLong: nullableDecimalTextSchema,
});

const fearGreedSchema = z.strictObject({
  value: z.number().int().min(0).max(100),
  observedAt: z.iso.datetime(),
});

// RF09: SÓ dado público de mercado. `strictObject` recusa `userId`, saldo, meta ou qualquer chave a mais.
export const teamPromptInputSchema = z.strictObject({
  symbol: z.string().regex(/^[A-Z0-9]{5,20}$/),
  timeframe: z.literal(PROMPT_TIMEFRAME),
  lastCandleCloseTime: z.iso.datetime(),
  candles: z.array(candleSchema).min(1).max(PROMPT_CANDLE_COUNT),
  readings: readingsSchema,
  fearGreed: fearGreedSchema.nullable(),
});
export type TeamPromptInput = z.infer<typeof teamPromptInputSchema>;
