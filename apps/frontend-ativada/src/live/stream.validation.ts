// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../http/decimal.validation.js';

const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('event'),
    runId: z.string(),
    kind: z.string(),
    eventId: z.string(),
    at: z.number(),
  }),
  z.object({ type: z.literal('price_alert'), alertId: z.string(), at: z.number() }),
  z.object({
    type: z.literal('tick'),
    symbol: z.string(),
    price: z.string(),
    change24h: z.string().nullable(),
    at: z.number(),
    serverTime: z.number(),
    stale: z.boolean(),
  }),
  // Vela em formação (spec 009, D9-A): no máximo 1 por segundo por par e vela; nunca entra no placar.
  z.object({
    type: z.literal('candle'),
    symbol: z.string(),
    timeframe: z.string(),
    openTime: z.number(),
    open: decimalText,
    high: decimalText,
    low: decimalText,
    close: decimalText,
    volume: decimalText,
    closed: z.boolean(),
    at: z.number(),
  }),
  z.object({ type: z.literal('resync'), reason: z.string() }),
  z.object({ type: z.literal('renewed'), expiresAt: z.number() }),
]);

export const ticketResponseSchema = z.object({
  ticket: z.string().min(1),
  expiresInSeconds: z.number().positive(),
});

export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type StreamCandle = Extract<ServerMessage, { type: 'candle' }>;

// Entrada do servidor também é não confiável: o que não casa com o formato exato é descartado.
export function parseServerMessage(data: unknown): ServerMessage | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    const parsed = serverMessageSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
