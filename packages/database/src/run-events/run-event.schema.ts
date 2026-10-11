// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import {
  MAX_EVENT_ID_LENGTH,
  PRICE_ALERT_EVENT_KIND,
  RUN_EVENT_KIND,
  type RunEventKind,
} from './run-event.constant.js';

const runEventSchema = z.strictObject({
  runId: z.uuid(),
  kind: z.enum(Object.values(RUN_EVENT_KIND) as [RunEventKind, ...RunEventKind[]]),
  eventId: z.string().min(1).max(MAX_EVENT_ID_LENGTH),
});

export type RunEvent = z.infer<typeof runEventSchema>;

// Entrada de outro processo: o que não casa com o formato exato é descartado, nunca interpretado.
export function parseRunEventPayload(payload: string): RunEvent | undefined {
  if (payload.length === 0) return undefined;
  try {
    const parsed = runEventSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const priceAlertEventSchema = z.strictObject({
  kind: z.literal(PRICE_ALERT_EVENT_KIND),
  alertId: z.uuid(),
});

export type PriceAlertEvent = z.infer<typeof priceAlertEventSchema>;

export function parsePriceAlertEventPayload(payload: string): PriceAlertEvent | undefined {
  if (payload.length === 0) return undefined;
  try {
    const parsed = priceAlertEventSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
