// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PriceAlertCursor } from '@ativada/database';
import { z } from '@ativada/environment';

import { decodeCursor, encodeCursor } from '../shared/pagination/cursor.js';
import { cursorInstantSchema } from '../shared/pagination/cursor-instant.js';

const priceAlertCursorSchema = z.strictObject({ c: cursorInstantSchema, i: z.uuid() });

export function encodePriceAlertCursor(cursor: PriceAlertCursor): string {
  return encodeCursor({ c: cursor.createdAt, i: cursor.id });
}

export function decodePriceAlertCursor(text: string): PriceAlertCursor | undefined {
  const decoded = decodeCursor(text, priceAlertCursorSchema);
  return decoded === undefined ? undefined : { createdAt: decoded.c, id: decoded.i };
}
