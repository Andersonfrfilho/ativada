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
import { GOAL_ERROR_CODE, VALIDATION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { PAGE_QUERY_SHAPE } from '../shared/pagination/page-query.schema.js';
import { GOAL_ID_PARAM } from './goal.constant.js';

const TAG = 'Metas';
const NULLABLE_RATE = decimalTextSchema.nullable();

export const GOAL_VIEW_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  symbol: z.string(),
  targetRate: decimalTextSchema,
  horizonDays: z.number().int().positive(),
  maxLossRate: decimalTextSchema,
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

const GOAL_FIELDS = {
  targetRate: z.string().describe('Ganho alvo como fração do saldo: "0.03" = 3%.'),
  maxLossRate: z.string().describe('Perda máxima aceitável como fração do saldo: "0.05" = 5%.'),
  horizonDays: z.number().int().describe('Prazo em dias, de 1 a 365.'),
};

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

const PAGE_QUERY = z.strictObject(PAGE_QUERY_SHAPE);
const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;
const NOT_FOUND = { status: HTTP_STATUS.NOT_FOUND, code: GOAL_ERROR_CODE.GOAL_NOT_FOUND } as const;
const PARAMS = pathIdSchema(GOAL_ID_PARAM);

export const GOAL_DOCUMENTATION = {
  list: {
    summary: 'Lista as metas do usuário, das mais novas para as mais antigas.',
    tag: TAG,
    query: PAGE_QUERY,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Uma página de metas.',
        schema: z.array(GOAL_VIEW_SCHEMA),
        isList: true,
      },
    ],
    errors: [VALIDATION],
  },
  create: {
    summary:
      'Declara uma meta: ganho alvo, prazo e perda máxima, sobre um par habilitado. Há um teto de metas por usuário.',
    tag: TAG,
    body: z.strictObject({ symbol: z.string(), ...GOAL_FIELDS }),
    successes: [{ status: HTTP_STATUS.CREATED, description: 'A meta.', schema: GOAL_VIEW_SCHEMA }],
    errors: [
      VALIDATION,
      { status: HTTP_STATUS.CONFLICT, code: GOAL_ERROR_CODE.GOAL_LIMIT_REACHED },
    ],
  },
  get: {
    summary: 'Uma meta.',
    tag: TAG,
    params: PARAMS,
    successes: [{ status: HTTP_STATUS.OK, description: 'A meta.', schema: GOAL_VIEW_SCHEMA }],
    errors: [NOT_FOUND],
  },
  update: {
    summary: 'Altera parcialmente uma meta (ganho, prazo, perda, par ou ligada/desligada).',
    tag: TAG,
    params: PARAMS,
    body: z.strictObject({
      symbol: z.string().optional(),
      targetRate: GOAL_FIELDS.targetRate.optional(),
      maxLossRate: GOAL_FIELDS.maxLossRate.optional(),
      horizonDays: GOAL_FIELDS.horizonDays.optional(),
      isActive: z.boolean().optional(),
    }),
    successes: [
      { status: HTTP_STATUS.OK, description: 'A meta alterada.', schema: GOAL_VIEW_SCHEMA },
    ],
    errors: [VALIDATION, NOT_FOUND],
  },
  delete: {
    summary: 'Apaga uma meta. Uma meta com simulações ligadas a ela não se apaga.',
    tag: TAG,
    params: PARAMS,
    successes: [{ status: HTTP_STATUS.NO_CONTENT, description: 'Apagada.' }],
    errors: [NOT_FOUND, { status: HTTP_STATUS.CONFLICT, code: GOAL_ERROR_CODE.GOAL_IN_USE }],
  },
  evaluation: {
    summary:
      'Avalia a meta com cada estratégia do usuário (as 5 mais novas) em cada par habilitado, sobre os candles diários: taxa de chegada, de stop e de prazo, tempo típico, comprar e segurar e o próximo gatilho. Ordenada por chegada (maior), stop (menor) e janelas (mais).',
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
    errors: [NOT_FOUND],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
