// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { BASE64_URL_ENCODING } from '../encoding.constant.js';

// O cursor é opaco para o cliente: JSON em base64url, validado por esquema na volta. Um cursor adulterado vira
// `undefined` (400), nunca um filtro construído a partir de texto cru.
export function encodeCursor(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString(BASE64_URL_ENCODING);
}

export function decodeCursor<TCursor>(
  text: string,
  schema: z.ZodType<TCursor>,
): TCursor | undefined {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(text, BASE64_URL_ENCODING).toString('utf8'));
    const parsed = schema.safeParse(decoded);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
