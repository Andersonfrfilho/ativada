// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { TIMESTAMP_PATTERN } from '../markets/markets.constant.js';
import { RUN_RANGE_FIELD, RUN_RANGE_REASON } from './runs.constant.js';

const timestampSchema = z.string().regex(TIMESTAMP_PATTERN).transform(Number);

// `from` incluído e `to` excluído, em milissegundos UTC (mesma grafia de `GET /v1/markets/candles`).
export const RANGE_QUERY_SHAPE = {
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
} as const;

type RangeQuery = { readonly from?: number | undefined; readonly to?: number | undefined };

// `to <= from` é erro de campo; roda depois dos campos, então os demais erros já foram coletados.
export function requireRangeOrder(query: RangeQuery, context: z.RefinementCtx): void {
  if (query.from === undefined || query.to === undefined || query.to > query.from) return;
  context.addIssue({
    code: 'custom',
    path: [RUN_RANGE_FIELD.TO],
    message: RUN_RANGE_REASON.MUST_BE_AFTER_FROM,
  });
}
