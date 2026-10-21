// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, type RunKind } from '@ativada/database';
import { z } from '@ativada/environment';

import type { EnabledMarkets } from '../markets/candles-query.schema.js';
import { resourceIdSchema } from '../openapi/schema-primitives.js';
import { PAGE_QUERY_SHAPE } from '../shared/pagination/page-query.schema.js';
import { RUN_REASON } from './runs.constant.js';

export type ListRunsQuery = {
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
  readonly kind?: RunKind | undefined;
  readonly symbol?: string | undefined;
  readonly strategyVersionId?: string | undefined;
};

// Filtros opcionais, combinados por E. O par só vale se habilitado: valor fora disso é 400, sem eco do que veio.
export function createListRunsQuerySchema(enabled: EnabledMarkets): z.ZodType<ListRunsQuery> {
  return z.strictObject({
    ...PAGE_QUERY_SHAPE,
    kind: z.enum(RUN_KIND).optional(),
    symbol: z
      .string()
      .refine((symbol) => enabled.symbols.includes(symbol), { error: RUN_REASON.NOT_ENABLED })
      .optional(),
    strategyVersionId: resourceIdSchema.optional(),
  });
}
