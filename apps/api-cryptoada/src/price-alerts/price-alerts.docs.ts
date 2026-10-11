// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  decimalTextSchema,
  isoDateTimeSchema,
  pathIdSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';
import {
  PRICE_ALERT_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { PAGE_QUERY_SHAPE } from '../shared/pagination/page-query.schema.js';
import { PRICE_ALERT_ID_PARAM } from './price-alert.constant.js';

const TAG = 'Alertas de preço';
const DIRECTION = z.enum(['above', 'below']);

export const PRICE_ALERT_VIEW_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  symbol: z.string(),
  direction: DIRECTION,
  value: decimalTextSchema,
  origin: z.enum(['manual', 'plan']),
  isEnabled: z.boolean(),
  triggeredAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;
const NOT_FOUND = {
  status: HTTP_STATUS.NOT_FOUND,
  code: PRICE_ALERT_ERROR_CODE.PRICE_ALERT_NOT_FOUND,
} as const;
const LIMIT = {
  status: HTTP_STATUS.CONFLICT,
  code: PRICE_ALERT_ERROR_CODE.PRICE_ALERT_LIMIT_REACHED,
} as const;
const PARAMS = pathIdSchema(PRICE_ALERT_ID_PARAM);

export const PRICE_ALERT_DOCUMENTATION = {
  list: {
    summary: 'Lista os alertas de preço do usuário, dos mais novos para os mais antigos.',
    tag: TAG,
    query: z.strictObject(PAGE_QUERY_SHAPE),
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Uma página de alertas.',
        schema: z.array(PRICE_ALERT_VIEW_SCHEMA),
        isList: true,
      },
    ],
    errors: [VALIDATION],
  },
  create: {
    summary:
      'Cria um alerta "subir acima de" / "cair abaixo de" um valor, por par. Com origem `plan` ele nasce de um preço do plano da meta ("Avisar no plano"). Há um teto de alertas ligados por usuário.',
    tag: TAG,
    body: z.strictObject({
      symbol: z.string(),
      direction: DIRECTION,
      value: z.string().describe('Preço em texto decimal, até 8 casas.'),
      origin: z.enum(['manual', 'plan']).optional(),
    }),
    successes: [
      { status: HTTP_STATUS.CREATED, description: 'O alerta.', schema: PRICE_ALERT_VIEW_SCHEMA },
    ],
    errors: [VALIDATION, LIMIT],
  },
  get: {
    summary: 'Um alerta de preço.',
    tag: TAG,
    params: PARAMS,
    successes: [
      { status: HTTP_STATUS.OK, description: 'O alerta.', schema: PRICE_ALERT_VIEW_SCHEMA },
    ],
    errors: [NOT_FOUND],
  },
  update: {
    summary:
      'Altera parcialmente um alerta (direção, valor ou ligado/desligado). Religar REARMA o alerta: limpa o disparo anterior.',
    tag: TAG,
    params: PARAMS,
    body: z.strictObject({
      direction: DIRECTION.optional(),
      value: z.string().optional(),
      isEnabled: z.boolean().optional(),
    }),
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'O alerta alterado.',
        schema: PRICE_ALERT_VIEW_SCHEMA,
      },
    ],
    errors: [VALIDATION, NOT_FOUND, LIMIT],
  },
  clearFired: {
    summary:
      'Apaga de uma vez os alertas de preço já disparados do usuário (os armados e os desligados à mão ficam) e devolve quantos foram apagados.',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Quantos alertas disparados foram apagados.',
        schema: z.strictObject({ deleted: z.number().int().nonnegative() }),
      },
    ],
    errors: [],
  },
  delete: {
    summary: 'Apaga um alerta de preço.',
    tag: TAG,
    params: PARAMS,
    successes: [{ status: HTTP_STATUS.NO_CONTENT, description: 'Apagado.' }],
    errors: [NOT_FOUND],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
