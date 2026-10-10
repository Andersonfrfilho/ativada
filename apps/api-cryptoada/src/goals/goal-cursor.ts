// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalCursor } from '@cryptoada/database';
import { z } from '@cryptoada/environment';

import { decodeCursor, encodeCursor } from '../shared/pagination/cursor.js';
import { cursorInstantSchema } from '../shared/pagination/cursor-instant.js';

const goalCursorSchema = z.strictObject({ c: cursorInstantSchema, i: z.uuid() });

export function encodeGoalCursor(cursor: GoalCursor): string {
  return encodeCursor({ c: cursor.createdAt, i: cursor.id });
}

export function decodeGoalCursor(text: string): GoalCursor | undefined {
  const decoded = decodeCursor(text, goalCursorSchema);
  return decoded === undefined ? undefined : { createdAt: decoded.c, id: decoded.i };
}
