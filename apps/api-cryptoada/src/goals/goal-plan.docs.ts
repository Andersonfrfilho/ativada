// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  decimalTextSchema,
  epochMillisecondsSchema,
  isoDateTimeSchema,
  pathIdSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';
import {
  GOAL_ERROR_CODE,
  STRATEGY_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { GOAL_ID_PARAM } from './goal.constant.js';
import { GOAL_VIEW_SCHEMA } from './goal-view.schema.js';

const TAG = 'Metas';
const NULLABLE_RATE = decimalTextSchema.nullable();
const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;

const PLAN_LEVEL_SCHEMA = z.strictObject({
  status: z.enum(['price', 'already_active', 'unreachable']),
  price: NULLABLE_RATE,
  trigger: z.enum(['at_or_above', 'at_or_below']).nullable(),
  direction: z.enum(['above', 'below']).nullable(),
  distance: NULLABLE_RATE,
  distanceRate: NULLABLE_RATE,
});

const PROTECTIVE_SCHEMA = z.strictObject({ rate: decimalTextSchema, price: decimalTextSchema });

export const GOAL_PLAN_VIEW_SCHEMA = z.strictObject({
  goal: GOAL_VIEW_SCHEMA,
  strategy: z.strictObject({
    id: resourceIdSchema,
    name: z.string(),
    versionId: resourceIdSchema,
    version: z.number().int().positive(),
  }),
  symbol: z.string(),
  candlesUsed: z.number().int().nonnegative(),
  lastCandleOpenTime: epochMillisecondsSchema.nullable(),
  deadline: isoDateTimeSchema,
  plan: z.strictObject({
    version: z.string(),
    lastCloseTime: epochMillisecondsSchema,
    lastClose: decimalTextSchema,
    basis: z.enum(['exact', 'indicative']),
    signal: z.strictObject({ action: z.string(), score: decimalTextSchema }),
    buy: PLAN_LEVEL_SCHEMA,
    exit: PLAN_LEVEL_SCHEMA,
    entryReference: NULLABLE_RATE,
    target: PROTECTIVE_SCHEMA.nullable(),
    stop: PROTECTIVE_SCHEMA.nullable(),
    startsAt: epochMillisecondsSchema,
    deadlineAt: epochMillisecondsSchema,
    horizonDays: z.number().int().positive(),
    rules: z.array(
      z.strictObject({
        ruleId: z.string(),
        kind: z.string(),
        family: z.string(),
        basis: z.enum(['exact', 'indicative']),
        buy: PLAN_LEVEL_SCHEMA,
        exit: PLAN_LEVEL_SCHEMA,
      }),
    ),
  }),
});

export const GOAL_PLAN_DOCUMENTATION = {
  plan: {
    summary:
      'O plano de operação da meta com uma estratégia do usuário: o fechamento que faz o placar (e cada regra) sinalizar compra e saída no próximo candle, no tick exato, alvo e stop de venda com taxas e slippage, e a data limite. Em cache por último candle.',
    tag: TAG,
    params: pathIdSchema(GOAL_ID_PARAM),
    query: z.strictObject({ strategyId: resourceIdSchema }),
    successes: [
      {
        status: HTTP_STATUS.OK,
        description:
          'O plano. É o que o motor decide sobre o candle hipotético descrito no ADR 0002, não garantia.',
        schema: GOAL_PLAN_VIEW_SCHEMA,
      },
    ],
    errors: [
      VALIDATION,
      { status: HTTP_STATUS.NOT_FOUND, code: GOAL_ERROR_CODE.GOAL_NOT_FOUND },
      { status: HTTP_STATUS.NOT_FOUND, code: STRATEGY_ERROR_CODE.STRATEGY_NOT_FOUND },
      { status: HTTP_STATUS.CONFLICT, code: GOAL_ERROR_CODE.GOAL_PLAN_UNAVAILABLE },
    ],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
