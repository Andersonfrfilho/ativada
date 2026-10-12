// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { StrategyCursor } from '@ativada/database';
import { z } from '@ativada/environment';

import { decodeCursor, encodeCursor } from '../shared/pagination/cursor.js';
import { cursorInstantSchema } from '../shared/pagination/cursor-instant.js';

const strategyCursorSchema = z.strictObject({ c: cursorInstantSchema, i: z.uuid() });
const versionCursorSchema = z.strictObject({ v: z.number().int().positive() });

export function encodeStrategyCursor(cursor: StrategyCursor): string {
  return encodeCursor({ c: cursor.createdAt, i: cursor.id });
}

export function decodeStrategyCursor(text: string): StrategyCursor | undefined {
  const decoded = decodeCursor(text, strategyCursorSchema);
  return decoded === undefined ? undefined : { createdAt: decoded.c, id: decoded.i };
}

export function encodeVersionCursor(version: number): string {
  return encodeCursor({ v: version });
}

export function decodeVersionCursor(text: string): number | undefined {
  return decodeCursor(text, versionCursorSchema)?.v;
}
