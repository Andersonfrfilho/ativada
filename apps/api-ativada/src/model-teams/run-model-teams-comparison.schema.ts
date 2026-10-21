// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { MODEL_TEAM_KEYS } from '@ativada/model-agents';

import { decimalTextSchema, epochMillisecondsSchema } from '../openapi/schema-primitives.js';
import { cursorTextSchema } from '../shared/pagination/page-query.schema.js';
import { MODEL_TEAM_COMPARISON_PAGE } from './model-team.constant.js';
import { RECOMMENDATION_STATUS } from './model-team-view.schema.js';

const LIMIT_PATTERN = /^\d{1,3}$/;

export const comparisonQuerySchema = z.strictObject({
  cursor: cursorTextSchema.optional(),
  limit: z
    .string()
    .regex(LIMIT_PATTERN)
    .transform(Number)
    .pipe(z.number().int().min(1).max(MODEL_TEAM_COMPARISON_PAGE.MAXIMUM))
    .optional(),
});

export type ComparisonQuery = z.infer<typeof comparisonQuerySchema>;

// O que a vela SEGUINTE fez em relação ao fechamento da vela da linha; `open` = a seguinte ainda não fechou.
export const NEXT_MOVE = { UP: 'up', DOWN: 'down', EQUAL: 'equal', OPEN: 'open' } as const;
export type NextMove = (typeof NEXT_MOVE)[keyof typeof NEXT_MOVE];

const RULE_ROW_SCHEMA = z.strictObject({
  key: z.string(),
  vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]).nullable(),
  // ✓ ou ✗ só em voto com lado; empate, lacuna e vela ainda aberta ficam sem marca.
  isHit: z.boolean().nullable(),
});

const TEAM_ROW_SCHEMA = z.strictObject({
  teamKey: z.enum(MODEL_TEAM_KEYS),
  status: z.enum(RECOMMENDATION_STATUS).nullable(),
  action: z.enum(['buy', 'sell', 'hold']).nullable(),
  isHit: z.boolean().nullable(),
});

export const COMPARISON_ITEM_SCHEMA = z.strictObject({
  candleTime: epochMillisecondsSchema,
  closedAt: epochMillisecondsSchema,
  close: decimalTextSchema,
  next: z.enum(Object.values(NEXT_MOVE)),
  nextClose: decimalTextSchema.nullable(),
  // Os votos dos especialistas de regra (`analyst_decisions`); `null` na simulação sem analista.
  rules: z.array(RULE_ROW_SCHEMA).nullable(),
  teams: z.array(TEAM_ROW_SCHEMA),
});

export const COMPARISON_SCHEMA = z.array(COMPARISON_ITEM_SCHEMA);

export type ComparisonItemView = z.infer<typeof COMPARISON_ITEM_SCHEMA>;
