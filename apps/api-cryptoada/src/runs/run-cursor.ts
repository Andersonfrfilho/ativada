// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FillCursor, OrderCursor, PositionCursor, RunCursor } from '@cryptoada/database';
import { z } from '@cryptoada/environment';

import { decodeCursor, encodeCursor } from '../shared/pagination/cursor.js';
import { cursorInstantSchema } from '../shared/pagination/cursor-instant.js';

const runCursorSchema = z.strictObject({ c: cursorInstantSchema, i: z.uuid() });
const timeCursorSchema = z.strictObject({ t: z.number().int().nonnegative() });
const KEY_MAX_LENGTH = 64;
const orderCursorSchema = z.strictObject({
  c: z.number().int().nonnegative(),
  k: z.string().min(1).max(KEY_MAX_LENGTH),
});
const fillCursorSchema = orderCursorSchema;
const positionCursorSchema = orderCursorSchema;

export const encodeRunCursor = (cursor: RunCursor): string =>
  encodeCursor({ c: cursor.createdAt, i: cursor.id });

export function decodeRunCursor(text: string): RunCursor | undefined {
  const decoded = decodeCursor(text, runCursorSchema);
  return decoded === undefined ? undefined : { createdAt: decoded.c, id: decoded.i };
}

export const encodeTimeCursor = (candleTime: number): string => encodeCursor({ t: candleTime });

export const decodeTimeCursor = (text: string): number | undefined =>
  decodeCursor(text, timeCursorSchema)?.t;

export const encodeOrderCursor = (cursor: OrderCursor): string =>
  encodeCursor({ c: cursor.createdCandleTime, k: cursor.engineKey });

export function decodeOrderCursor(text: string): OrderCursor | undefined {
  const decoded = decodeCursor(text, orderCursorSchema);
  return decoded === undefined ? undefined : { createdCandleTime: decoded.c, engineKey: decoded.k };
}

export const encodeFillCursor = (cursor: FillCursor): string =>
  encodeCursor({ c: cursor.candleTime, k: cursor.orderKey });

export function decodeFillCursor(text: string): FillCursor | undefined {
  const decoded = decodeCursor(text, fillCursorSchema);
  return decoded === undefined ? undefined : { candleTime: decoded.c, orderKey: decoded.k };
}

export const encodePositionCursor = (cursor: PositionCursor): string =>
  encodeCursor({ c: cursor.openedCandleTime, k: cursor.engineKey });

export function decodePositionCursor(text: string): PositionCursor | undefined {
  const decoded = decodeCursor(text, positionCursorSchema);
  return decoded === undefined ? undefined : { openedCandleTime: decoded.c, engineKey: decoded.k };
}
