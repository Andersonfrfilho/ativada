// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { readValidatedQuery } from '../http/read-validated-query.js';
import { invalidCursorError, PAGE_QUERY_SHAPE } from './page-query.schema.js';
import { DEFAULT_PAGE_SIZE } from './pagination.constant.js';

export type PageRequest<TCursor> = {
  readonly limit: number;
  readonly after: TCursor | undefined;
};

const pageQuerySchema = z.strictObject(PAGE_QUERY_SHAPE);

// `limit` (1 a 100) e `cursor` opaco; cursor adulterado é 400, nunca um filtro montado de texto cru.
export function readPage<TCursor>(
  request: Request,
  decode: (text: string) => TCursor | undefined,
): PageRequest<TCursor> {
  const query = readValidatedQuery(request, pageQuerySchema);
  const after = query.cursor === undefined ? undefined : decode(query.cursor);
  if (query.cursor !== undefined && after === undefined) throw invalidCursorError();
  return { limit: query.limit ?? DEFAULT_PAGE_SIZE, after };
}
