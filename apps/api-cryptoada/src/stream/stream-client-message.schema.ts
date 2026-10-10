// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { CLIENT_MESSAGE_TYPE, MAX_TICKET_LENGTH } from './stream.constant.js';

const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(CLIENT_MESSAGE_TYPE.RENEW),
    ticket: z.string().min(1).max(MAX_TICKET_LENGTH),
  }),
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
