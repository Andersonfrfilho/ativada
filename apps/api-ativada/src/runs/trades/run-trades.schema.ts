// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { PAGE_QUERY_SHAPE } from '../../shared/pagination/page-query.schema.js';
import { RANGE_QUERY_SHAPE, requireRangeOrder } from '../run-range-query.js';
import { TRADE_STATUS_FILTER } from '../runs.constant.js';

// A query estrita das operações: paginação de sempre, mais a faixa de tempo e o filtro de abertas ou fechadas.
export const tradesQuerySchema = z
  .strictObject({
    ...PAGE_QUERY_SHAPE,
    ...RANGE_QUERY_SHAPE,
    status: z.enum(TRADE_STATUS_FILTER).optional(),
  })
  .superRefine(requireRangeOrder);
