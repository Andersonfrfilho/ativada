// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { NoticeCursor } from '@ativada/database';
import { z } from '@ativada/environment';

import { decodeCursor, encodeCursor } from '../shared/pagination/cursor.js';

const NOTICE_ID_MAXIMUM_LENGTH = 200;
const noticeCursorSchema = z.strictObject({
  a: z.number().int().nonnegative(),
  i: z.string().min(1).max(NOTICE_ID_MAXIMUM_LENGTH),
});

export const encodeNoticeCursor = (cursor: NoticeCursor): string =>
  encodeCursor({ a: cursor.occurredAt, i: cursor.noticeId });

export function decodeNoticeCursor(text: string): NoticeCursor | undefined {
  const decoded = decodeCursor(text, noticeCursorSchema);
  return decoded === undefined ? undefined : { occurredAt: decoded.a, noticeId: decoded.i };
}
