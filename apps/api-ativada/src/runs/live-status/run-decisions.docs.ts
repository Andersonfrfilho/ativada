// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import { pathIdSchema } from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { PAGE_QUERY_SHAPE } from '../../shared/pagination/page-query.schema.js';
import { RUN_ID_PARAM } from '../runs.constant.js';
import { DECISION_SCHEMA } from './live-status.schema.js';

export const runDecisionsQuerySchema = z.strictObject(PAGE_QUERY_SHAPE);

export const RUN_DECISIONS_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Decisões da simulação ao vivo, uma por vela fechada (esperas incluídas), da mais recente para a mais antiga, por ' +
    'cursor (padrão 24, máximo 100). São as mesmas linhas da primeira página do `live-status`, com a frase do motivo e o ' +
    'voto de cada regra. Só `live_paper`; outro tipo responde 409 `RUN_NOT_LIVE`.',
  tag: 'Execuções — acompanhamento',
  params: pathIdSchema(RUN_ID_PARAM),
  query: runDecisionsQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'Uma página de decisões, da mais recente para a mais antiga.',
      schema: z.array(DECISION_SCHEMA),
      isList: true,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
    { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_NOT_LIVE },
  ],
};
