// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';
import { ENGINE_TIMEFRAME } from '@cryptoada/strategy-engine';

export const SEARCH_MESSAGE_TYPE = {
  INIT: 'init',
  EVALUATE: 'evaluate',
  STARTED: 'started',
  READY: 'ready',
  RESULT: 'result',
  FAILED: 'failed',
} as const;

const countSchema = z.int().min(0);
const timeSchema = z.int().min(0);
const textSchema = z.string().max(64);

const CANDLE_SCHEMA = z.strictObject({
  symbol: textSchema,
  timeframe: z.enum(Object.values(ENGINE_TIMEFRAME)),
  openTime: timeSchema,
  closeTime: timeSchema,
  open: textSchema,
  high: textSchema,
  low: textSchema,
  close: textSchema,
  volume: textSchema,
});

const SENTIMENT_SCHEMA = z
  .strictObject({ value: countSchema, observedAt: timeSchema, source: textSchema })
  .nullable();

const SPAN_SCHEMA = z.strictObject({ anchorIndex: countSchema, limitIndex: countSchema });

export const WINDOW_SUMMARY_SCHEMA = z.strictObject({
  windowIndex: countSchema,
  trades: countSchema,
  sharpe: z.string().max(64).nullable(),
  maxDrawdownAtLow: z.string().max(64),
  points: countSchema,
});

// Pedido da thread: o contexto do ajuste (uma vez) e depois só o índice da combinação. Nenhum dado de usuário,
// segredo nem estado do motor atravessa a fronteira.
export const SEARCH_REQUEST_SCHEMA = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(SEARCH_MESSAGE_TYPE.INIT),
    parameters: z.unknown(),
    candles: z.array(CANDLE_SCHEMA),
    sentiments: z.array(SENTIMENT_SCHEMA),
    trainSpans: z.array(SPAN_SCHEMA),
    strategies: z.array(z.unknown()),
  }),
  z.strictObject({
    type: z.literal(SEARCH_MESSAGE_TYPE.EVALUATE),
    taskId: countSchema,
    combinationIndex: countSchema,
  }),
]);

export const SEARCH_EVENT_SCHEMA = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal(SEARCH_MESSAGE_TYPE.STARTED) }),
  z.strictObject({ type: z.literal(SEARCH_MESSAGE_TYPE.READY) }),
  z.strictObject({
    type: z.literal(SEARCH_MESSAGE_TYPE.RESULT),
    taskId: countSchema,
    combinationIndex: countSchema,
    windows: z.array(WINDOW_SUMMARY_SCHEMA),
  }),
  z.strictObject({ type: z.literal(SEARCH_MESSAGE_TYPE.FAILED), taskId: countSchema.optional() }),
]);

export type SearchRequest = z.infer<typeof SEARCH_REQUEST_SCHEMA>;
export type SearchEvent = z.infer<typeof SEARCH_EVENT_SCHEMA>;
