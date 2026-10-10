// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  parseAccountId,
  type AccountPageCursor,
  type AdminAccountRecord,
} from '@cryptoada/database';
import { z } from '@cryptoada/environment';

const cursorPayloadSchema = z.strictObject({ c: z.iso.datetime(), i: z.string() });

export function encodeAccountCursor(record: AdminAccountRecord): string {
  const payload = { c: record.createdAt.toISOString(), i: record.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeAccountCursor(cursor: string): AccountPageCursor | undefined {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = cursorPayloadSchema.safeParse(decoded);
    if (!parsed.success) return undefined;
    const id = parseAccountId(parsed.data.i);
    return id === undefined ? undefined : { createdAt: new Date(parsed.data.c), id };
  } catch {
    return undefined;
  }
}
