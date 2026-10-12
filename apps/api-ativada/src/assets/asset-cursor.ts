// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decodeCursor, encodeCursor } from '../shared/pagination/cursor.js';

const assetCursorSchema = z.strictObject({ s: z.string().regex(/^[A-Z0-9]{2,16}USDT$/) });

export function encodeAssetCursor(symbol: string): string {
  return encodeCursor({ s: symbol });
}

export function decodeAssetCursor(text: string): string | undefined {
  return decodeCursor(text, assetCursorSchema)?.s;
}
