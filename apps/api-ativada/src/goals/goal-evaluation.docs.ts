// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  decimalTextSchema,
  epochMillisecondsSchema,
  pathIdSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';
import { GOAL_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { GOAL_ID_PARAM } from './goal.constant.js';
import { GOAL_VIEW_SCHEMA } from './goal-view.schema.js';

const TAG = 'Metas';
const NULLABLE_RATE = decimalTextSchema.nullable();
const NOT_FOUND = { status: HTTP_STATUS.NOT_FOUND, code: GOAL_ERROR_CODE.GOAL_NOT_FOUND } as const;
const PARAMS = pathIdSchema(GOAL_ID_PARAM);

const BENCHMARK_SCHEMA = z.strictObject({
  reachedCount: z.number().int().nonnegative(),
  stoppedCount: z.number().int().nonnegative(),
  reachRate: NULLABLE_RATE,
  stopRate: NULLABLE_RATE,
});

const EVALUATION_SCHEMA = z.strictObject({
  version: z.string(),
  goal: z.strictObject({
    targetRate: decimalTextSchema,
    maxLossRate: decimalTextSchema,
    horizonDays: z.number().int().positive(),
  }),
  horizonCandles: z.number().int().positive(),
  levels: z.strictObject({ target: decimalTextSchema, stop: decimalTextSchema }),
  windowCount: z.number().int().nonnegative(),
  firstWindowOpenTime: epochMillisecondsSchema.nullable(),
  lastWindowOpenTime: epochMillisecondsSchema.nullable(),
  reachedCount: z.number().int().nonnegative(),
  stoppedCount: z.number().int().nonnegative(),
  expiredCount: z.number().int().nonnegative(),
  reachRate: NULLABLE_RATE,
  stopRate: NULLABLE_RATE,
  expiredRate: NULLABLE_RATE,
  medianCandlesToTarget: NULLABLE_RATE,
  medianDaysToTarget: NULLABLE_RATE,
  netReturn: z.strictObject({ mean: NULLABLE_RATE, median: NULLABLE_RATE }),
  benchmark: BENCHMARK_SCHEMA,
  verdict: z.enum(['COMPRAR', 'SEGURAR', 'EVITAR']),
});

const TRIGGER_RULE_SCHEMA = z.strictObject({
  ruleId: z.string(),
  kind: z.string(),
  family: z.string(),
  vote: z.number().int().min(-1).max(1),
  weight: decimalTextSchema,
  isMet: z.boolean(),
  metric: z.string(),
  direction: z.enum(['above', 'below']),
  basis: z.enum(['exact', 'indicative']),
  current: NULLABLE_RATE,
  threshold: NULLABLE_RATE,
  distance: NULLABLE_RATE,
  distanceRate: NULLABLE_RATE,
});

const SITUATION_SCHEMA = z.strictObject({
  signal: z.strictObject({
    action: z.string(),
    score: decimalTextSchema,
    regime: z.string(),
    reason: z.string(),
  }),
  triggers: z.strictObject({
    version: z.string(),
    state: z.string(),
    action: z.string(),
    score: decimalTextSchema,
    scoreThreshold: decimalTextSchema,
    scoreGap: decimalTextSchema,
    rules: z.array(TRIGGER_RULE_SCHEMA),
  }),
});

export const GOAL_EVALUATION_VIEW_SCHEMA = z.strictObject({
  goal: GOAL_VIEW_SCHEMA,
  timeframe: z.string(),
  evaluatedStrategies: z.number().int().nonnegative(),
  isStrategyListTruncated: z.boolean(),
  combinations: z.array(
    z.strictObject({
      rank: z.number().int().positive(),
      strategy: z.strictObject({
        id: resourceIdSchema,
        name: z.string(),
        versionId: resourceIdSchema,
        version: z.number().int().positive(),
      }),
      symbol: z.string(),
      isGoalSymbol: z.boolean(),
      candlesUsed: z.number().int().nonnegative(),
      lastCandleOpenTime: epochMillisecondsSchema.nullable(),
      evaluation: EVALUATION_SCHEMA,
      situation: SITUATION_SCHEMA.nullable(),
    }),
  ),
  unavailable: z.array(
    z.strictObject({ strategyId: resourceIdSchema, symbol: z.string(), reason: z.string() }),
  ),
});

export const GOAL_EVALUATION_DOCUMENTATION = {
  evaluation: {
    summary:
      'Avalia a meta com cada estratégia do usuário (as 5 mais novas) em cada par habilitado, sobre os candles diários: taxa de chegada, de stop e de prazo, tempo típico, comprar e segurar e o próximo gatilho. Ordenada por chegada (maior), stop (menor) e janelas (mais). O que já está em cache responde na hora; o que falta é calculado numa thread à parte e gasta o orçamento de 3 avaliações a frio por minuto (429 RATE_LIMITED com Retry-After); com muitas avaliações em andamento a resposta é 503 com Retry-After.',
    tag: TAG,
    params: PARAMS,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description:
          'O ranking. É frequência no histórico, não garantia: "chegou à meta em X% das janelas".',
        schema: GOAL_EVALUATION_VIEW_SCHEMA,
      },
    ],
    errors: [
      NOT_FOUND,
      { status: HTTP_STATUS.SERVICE_UNAVAILABLE, code: GOAL_ERROR_CODE.GOAL_EVALUATION_BUSY },
      { status: HTTP_STATUS.SERVICE_UNAVAILABLE, code: GOAL_ERROR_CODE.GOAL_EVALUATION_TIMEOUT },
    ],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
