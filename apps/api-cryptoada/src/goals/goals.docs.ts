// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { pathIdSchema } from '../openapi/schema-primitives.js';
import { GOAL_ERROR_CODE, VALIDATION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { PAGE_QUERY_SHAPE } from '../shared/pagination/page-query.schema.js';
import { GOAL_ID_PARAM } from './goal.constant.js';
import { GOAL_EVALUATION_DOCUMENTATION } from './goal-evaluation.docs.js';
import { GOAL_VIEW_SCHEMA } from './goal-view.schema.js';

const TAG = 'Metas';

const GOAL_FIELDS = {
  targetRate: z.string().describe('Ganho alvo como fração do saldo: "0.03" = 3%.'),
  maxLossRate: z.string().describe('Perda máxima aceitável como fração do saldo: "0.05" = 5%.'),
  horizonDays: z.number().int().describe('Prazo em dias, de 1 a 365.'),
};

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
    summary:
      'Altera parcialmente uma meta (ganho, prazo, perda, par ou ligada/desligada). Mudar ganho, prazo ou perda máxima gasta o mesmo orçamento de avaliações a frio (3 por minuto) que a avaliação: RATE_LIMITED com Retry-After quando acaba.',
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
  evaluation: GOAL_EVALUATION_DOCUMENTATION.evaluation,
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
