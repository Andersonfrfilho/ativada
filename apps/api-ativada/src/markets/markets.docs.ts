// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { VALIDATION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { decimalTextSchema, epochMillisecondsSchema } from '../openapi/schema-primitives.js';

export const CANDLE_VIEW_SCHEMA = z.strictObject({
  openTime: epochMillisecondsSchema,
  closeTime: epochMillisecondsSchema,
  open: decimalTextSchema,
  high: decimalTextSchema,
  low: decimalTextSchema,
  close: decimalTextSchema,
  volume: decimalTextSchema,
  tradeCount: z.number().int().nonnegative(),
});

export const CANDLE_META_SCHEMA = z.strictObject({ retentionStart: epochMillisecondsSchema });

export function createMarketDocumentation(query: z.ZodType): RouteDocumentation {
  return {
    summary:
      'Candles fechados de um par e timeframe habilitados, de `from` (incluído) a `to` (excluído), no máximo 5.000 por resposta. Velas de exibição (3m) só existem dentro da retenção: a resposta traz `meta.retentionStart`.',
    tag: 'Mercado',
    query,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description:
          'Candles em ordem crescente de abertura, preços e volume como texto decimal. `meta.retentionStart` só nas velas de exibição.',
        schema: z.array(CANDLE_VIEW_SCHEMA),
        meta: CANDLE_META_SCHEMA,
      },
    ],
    errors: [
      { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    ],
  };
}
