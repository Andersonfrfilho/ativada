// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import {
  MARKET_CLIENT_MESSAGE_TYPE,
  MAX_PAIRS_PER_MESSAGE,
  PAIR_PATTERN,
} from '../market-stream/market-stream.constant.js';
import { CLIENT_MESSAGE_TYPE, MAX_TICKET_LENGTH } from './stream.constant.js';

const pairsSchema = z.array(z.string().regex(PAIR_PATTERN)).min(1).max(MAX_PAIRS_PER_MESSAGE);

const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(CLIENT_MESSAGE_TYPE.RENEW),
    ticket: z.string().min(1).max(MAX_TICKET_LENGTH),
  }),
  z.strictObject({ type: z.literal(MARKET_CLIENT_MESSAGE_TYPE.SUBSCRIBE), pairs: pairsSchema }),
  z.strictObject({ type: z.literal(MARKET_CLIENT_MESSAGE_TYPE.UNSUBSCRIBE), pairs: pairsSchema }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// Entrada do navegador: o que não casa com o formato exato é descartado, nunca interpretado.
export function parseClientMessage(text: string): ClientMessage | undefined {
  try {
    const parsed = clientMessageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
