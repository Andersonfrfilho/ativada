// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import {
  decimalTextSchema,
  epochMillisecondsSchema,
  pathIdSchema,
} from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { RUN_ID_PARAM } from '../runs.constant.js';
import { chartQuerySchema } from './run-chart.schema.js';

const COLUMN_SCHEMA = z.strictObject({
  startTime: epochMillisecondsSchema,
  endTime: epochMillisecondsSchema,
  first: decimalTextSchema,
  last: decimalTextSchema,
  low: decimalTextSchema,
  high: decimalTextSchema,
});

const MARKER_SCHEMA = z.strictObject({
  positionKey: z.string(),
  side: z.enum(['buy', 'sell']),
  candleTime: epochMillisecondsSchema,
  price: decimalTextSchema,
  quantity: decimalTextSchema,
  fee: decimalTextSchema,
  amount: decimalTextSchema,
  netProfit: decimalTextSchema.optional(),
  netProfitRate: decimalTextSchema.optional(),
});

const CLUSTER_SCHEMA = z.strictObject({
  startTime: epochMillisecondsSchema,
  endTime: epochMillisecondsSchema,
  buys: z.number().int().nonnegative(),
  sells: z.number().int().nonnegative(),
});

const CHART_SCHEMA = z.strictObject({
  symbol: z.string(),
  timeframe: z.string(),
  from: epochMillisecondsSchema,
  to: epochMillisecondsSchema,
  lastClosedCandleTime: epochMillisecondsSchema.nullable(),
  columns: z.array(COLUMN_SCHEMA),
  markers: z.array(MARKER_SCHEMA).nullable(),
  clusters: z.array(CLUSTER_SCHEMA).nullable(),
  totals: z.strictObject({
    buys: z.number().int().nonnegative(),
    sells: z.number().int().nonnegative(),
  }),
});

export const RUN_CHART_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Preço da moeda reduzido a colunas (primeiro, último, mínima e máxima) e as compras e vendas da faixa. A faixa ' +
    '`[from, to)` (ms UTC) é recortada à da execução (walk-forward: só a parte fora da amostra; ao vivo: até a última ' +
    'vela processada). `columns` vai de 100 a 2.000 (padrão 800). Até 500 preenchimentos vêm em `markers`; acima disso, ' +
    '`clusters` por coluna (um dos dois é `null`).',
  tag: 'Execuções — séries',
  params: pathIdSchema(RUN_ID_PARAM),
  query: chartQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'O preço reduzido e as operações da faixa.',
      schema: CHART_SCHEMA,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
  ],
};
