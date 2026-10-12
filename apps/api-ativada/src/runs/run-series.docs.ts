// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RESULT_ORDER } from '@ativada/database';
import { z } from '@ativada/environment';
import {
  EXIT_REASON,
  ORDER_EVENT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  ORDER_TYPE,
  REGIME,
  SIGNAL_ACTION,
} from '@ativada/strategy-engine';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  decimalTextSchema,
  epochMillisecondsSchema,
  pathIdSchema,
} from '../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { PAGE_QUERY_SHAPE } from '../shared/pagination/page-query.schema.js';
import { RUN_ID_PARAM } from './runs.constant.js';

const TAG = 'Execuções — séries';
const optionalDecimal = decimalTextSchema.optional();
const jsonSchema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

const EQUITY_SCHEMA = z.strictObject({
  candleTime: epochMillisecondsSchema,
  equity: decimalTextSchema,
  equityAtLow: decimalTextSchema,
  benchmark: decimalTextSchema,
});

const TRADE_SCHEMA = z.strictObject({
  engineKey: z.string(),
  status: z.enum(['open', 'closed']),
  entryPrice: decimalTextSchema,
  quantity: decimalTextSchema,
  stopPrice: decimalTextSchema,
  targetPrice: decimalTextSchema,
  entryFee: decimalTextSchema,
  exitPrice: optionalDecimal,
  exitFee: optionalDecimal,
  netProfit: optionalDecimal,
  exitReason: z.enum(EXIT_REASON).optional(),
  openedCandleTime: epochMillisecondsSchema,
  closedCandleTime: epochMillisecondsSchema.optional(),
});

const SIGNAL_SCHEMA = z.strictObject({
  candleTime: epochMillisecondsSchema,
  action: z.enum(SIGNAL_ACTION),
  score: decimalTextSchema,
  regime: z.enum(REGIME),
  votes: jsonSchema,
  indicators: jsonSchema,
  sentimentObservation: jsonSchema.optional(),
  reason: z.string(),
});

const ORDER_SCHEMA = z.strictObject({
  engineKey: z.string(),
  side: z.enum(ORDER_SIDE),
  type: z.enum(ORDER_TYPE),
  purpose: z.enum(ORDER_PURPOSE),
  status: z.enum(ORDER_STATUS),
  reason: z.enum(ORDER_EVENT_REASON).optional(),
  quantity: optionalDecimal,
  price: optionalDecimal,
  limitPrice: optionalDecimal,
  triggerPrice: optionalDecimal,
  riskAmount: optionalDecimal,
  stopDistance: optionalDecimal,
  targetDistance: optionalDecimal,
  eligibleCandles: z.number().int().optional(),
  createdCandleTime: epochMillisecondsSchema,
  expiresCandleTime: epochMillisecondsSchema.optional(),
  lastEventCandleTime: epochMillisecondsSchema,
});

const FILL_SCHEMA = z.strictObject({
  orderKey: z.string(),
  positionKey: z.string(),
  candleTime: epochMillisecondsSchema,
  side: z.enum(ORDER_SIDE),
  price: decimalTextSchema,
  quantity: decimalTextSchema,
  notional: decimalTextSchema,
  fee: decimalTextSchema,
});

const WINDOW_SCHEMA = z.strictObject({
  windowIndex: z.number().int().nonnegative(),
  trainStart: epochMillisecondsSchema,
  trainEnd: epochMillisecondsSchema,
  testStart: epochMillisecondsSchema,
  testEnd: epochMillisecondsSchema,
  bestParams: jsonSchema.optional(),
  status: z.enum(['ok', 'no_eligible_parameters']),
  inSample: jsonSchema,
  outOfSample: jsonSchema,
  eligibleCombinations: z.number().int().nonnegative(),
});

export const ORDERABLE_QUERY_SHAPE = {
  ...PAGE_QUERY_SHAPE,
  order: z.enum(RESULT_ORDER).optional(),
} as const;

function series(summary: string, item: z.ZodType, isOrderable = false): RouteDocumentation {
  return {
    summary,
    tag: TAG,
    params: pathIdSchema(RUN_ID_PARAM),
    query: z.strictObject(isOrderable ? ORDERABLE_QUERY_SHAPE : PAGE_QUERY_SHAPE),
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Uma página da série, por cursor.',
        schema: z.array(item),
        isList: true,
      },
    ],
    errors: [
      {
        status: HTTP_STATUS.BAD_REQUEST,
        code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
      },
      { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
    ],
  };
}

export const RUN_SERIES_DOCUMENTATION = {
  equity: series(
    'Curva de patrimônio, em ordem de candle (`order=desc` começa pelo ponto mais recente).',
    EQUITY_SCHEMA,
    true,
  ),
  trades: series('Operações (posições abertas e fechadas), em ordem de abertura.', TRADE_SCHEMA),
  signals: series(
    'Sinais (compra, venda ou neutro) com votos e motivo (`order=desc` começa pelo mais recente).',
    SIGNAL_SCHEMA,
    true,
  ),
  orders: series('Ordens simuladas.', ORDER_SCHEMA),
  fills: series('Preenchimentos das ordens.', FILL_SCHEMA),
  windows: series('Janelas do walk-forward (vazio nas outras execuções).', WINDOW_SCHEMA),
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
