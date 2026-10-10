// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';
import { STRATEGY_CONFIG_SCHEMA } from '@cryptoada/strategy-engine';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { isoDateTimeSchema, pathIdSchema, resourceIdSchema } from '../openapi/schema-primitives.js';
import {
  STRATEGY_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { PAGE_QUERY_SHAPE } from '../shared/pagination/page-query.schema.js';
import { STRATEGY_ID_PARAM, STRATEGY_NAME_MAX_LENGTH } from './strategy.constant.js';

const TAG = 'Estratégias';

export const STRATEGY_VIEW_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  name: z.string().min(1).max(STRATEGY_NAME_MAX_LENGTH),
  isExample: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const STRATEGY_VERSION_VIEW_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  strategyId: resourceIdSchema,
  version: z.number().int().positive(),
  config: STRATEGY_CONFIG_SCHEMA,
  createdAt: isoDateTimeSchema,
});

const STRATEGY_DETAIL_SCHEMA = STRATEGY_VIEW_SCHEMA.extend({
  latestVersion: STRATEGY_VERSION_VIEW_SCHEMA.nullable(),
});

const PAGE_QUERY = z.strictObject(PAGE_QUERY_SHAPE);
const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;
const NOT_FOUND = {
  status: HTTP_STATUS.NOT_FOUND,
  code: STRATEGY_ERROR_CODE.STRATEGY_NOT_FOUND,
} as const;

export const STRATEGY_DOCUMENTATION = {
  list: {
    summary: 'Lista as estratégias do usuário, das mais novas para as mais antigas.',
    tag: TAG,
    query: PAGE_QUERY,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Uma página de estratégias.',
        schema: z.array(STRATEGY_VIEW_SCHEMA),
        isList: true,
      },
    ],
    errors: [VALIDATION],
  },
  create: {
    summary: 'Cria uma estratégia e a versão 1 a partir da configuração.',
    tag: TAG,
    body: z.strictObject({
      name: z.string().min(1).max(STRATEGY_NAME_MAX_LENGTH),
      config: STRATEGY_CONFIG_SCHEMA,
    }),
    successes: [
      {
        status: HTTP_STATUS.CREATED,
        description: 'A estratégia e a versão 1.',
        schema: z.strictObject({
          strategy: STRATEGY_VIEW_SCHEMA,
          version: STRATEGY_VERSION_VIEW_SCHEMA,
        }),
      },
    ],
    errors: [VALIDATION],
  },
  get: {
    summary: 'Uma estratégia com a versão mais recente.',
    tag: TAG,
    params: pathIdSchema(STRATEGY_ID_PARAM),
    successes: [
      { status: HTTP_STATUS.OK, description: 'A estratégia.', schema: STRATEGY_DETAIL_SCHEMA },
    ],
    errors: [NOT_FOUND],
  },
  versions: {
    summary: 'Lista as versões de uma estratégia, da mais nova para a mais antiga.',
    tag: TAG,
    params: pathIdSchema(STRATEGY_ID_PARAM),
    query: PAGE_QUERY,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Uma página de versões.',
        schema: z.array(STRATEGY_VERSION_VIEW_SCHEMA),
        isList: true,
      },
    ],
    errors: [VALIDATION, NOT_FOUND],
  },
  addVersion: {
    summary:
      'Acrescenta uma versão. Configuração igual a uma versão existente devolve a MESMA versão (200).',
    tag: TAG,
    params: pathIdSchema(STRATEGY_ID_PARAM),
    body: z.strictObject({ config: STRATEGY_CONFIG_SCHEMA }),
    successes: [
      {
        status: HTTP_STATUS.CREATED,
        description: 'Versão nova.',
        schema: z.strictObject({ version: STRATEGY_VERSION_VIEW_SCHEMA }),
      },
      {
        status: HTTP_STATUS.OK,
        description: 'A configuração já existia: a versão existente.',
        schema: z.strictObject({ version: STRATEGY_VERSION_VIEW_SCHEMA }),
      },
    ],
    errors: [VALIDATION, NOT_FOUND],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
