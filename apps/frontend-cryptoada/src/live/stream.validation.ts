// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('event'),
    runId: z.string(),
    kind: z.string(),
    eventId: z.string(),
    at: z.number(),
  }),
  z.object({ type: z.literal('price_alert'), alertId: z.string(), at: z.number() }),
  z.object({ type: z.literal('resync'), reason: z.string() }),
  z.object({ type: z.literal('renewed'), expiresAt: z.number() }),
]);

export const ticketResponseSchema = z.object({
  ticket: z.string().min(1),
  expiresInSeconds: z.number().positive(),
});

export type ServerMessage = z.infer<typeof serverMessageSchema>;

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
