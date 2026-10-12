// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseAccountId, type AccountPageCursor, type AdminAccountRecord } from '@ativada/database';
import { z } from '@ativada/environment';

import { BASE64_URL_ENCODING } from '../shared/encoding.constant.js';

const cursorPayloadSchema = z.strictObject({ c: z.iso.datetime(), i: z.string() });

export function encodeAccountCursor(record: AdminAccountRecord): string {
  const payload = { c: record.createdAt.toISOString(), i: record.id };
  return Buffer.from(JSON.stringify(payload)).toString(BASE64_URL_ENCODING);
}

export function decodeAccountCursor(cursor: string): AccountPageCursor | undefined {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, BASE64_URL_ENCODING).toString('utf8'));
    const parsed = cursorPayloadSchema.safeParse(decoded);
    if (!parsed.success) return undefined;
    const id = parseAccountId(parsed.data.i);
    return id === undefined ? undefined : { createdAt: new Date(parsed.data.c), id };
  } catch {
    return undefined;
  }
}
