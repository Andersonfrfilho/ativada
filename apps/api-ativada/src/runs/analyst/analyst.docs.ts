// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import { pathIdSchema } from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { PAGE_QUERY_SHAPE } from '../../shared/pagination/page-query.schema.js';
import { RUN_ID_PARAM } from '../runs.constant.js';
import { ANALYST_DECISION_ITEM_SCHEMA, ANALYST_SCHEMA } from './analyst.schema.js';

export const analystQuerySchema = z.strictObject({});
export const analystDecisionsQuerySchema = z.strictObject(PAGE_QUERY_SHAPE);

const ANALYST_ERRORS = [
  { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
  { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
  { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_NOT_LIVE },
  { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.ANALYST_NOT_ENABLED },
] as const;

export const RUN_ANALYST_DOCUMENTATION: RouteDocumentation = {
  summary:
    'O analista de risco da simulação ao vivo (spec 007): a postura da vela mais nova (PAUSA, CAUTELA, MODERADA ou ' +
    'LIBERADA), o ritmo, o tamanho e a duração, o motivo, a equipe de especialistas com o auditor de acertos, as cinco ' +
    'travas, a meta somada e o modo (sombra: o analista só observa). Sem decisão para mostrar, `current` diz por quê ' +
    '(`not_running`, `stalled`, `waiting_for_data`, `no_candle`, `warming_up` ou `failed`). As frases saem do servidor, ' +
    'sem data nem hora; é uma regra automática sobre dados passados, não recomendação. Só `live_paper`; outro tipo ' +
    'responde 409 `RUN_NOT_LIVE` e simulação sem analista, 409 `ANALYST_NOT_ENABLED`.',
  tag: 'Execuções — analista de risco',
  params: pathIdSchema(RUN_ID_PARAM),
  query: analystQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'O analista de risco desta simulação.',
      schema: ANALYST_SCHEMA,
    },
  ],
  errors: ANALYST_ERRORS,
};

export const RUN_ANALYST_DECISIONS_DOCUMENTATION: RouteDocumentation = {
  summary:
    'As decisões do analista de risco, uma por vela de 15 min, da mais recente para a mais antiga, por cursor (padrão ' +
    '24, máximo 100). Cada item traz a postura, o ritmo, o tamanho, o motivo, a tabela da equipe e as travas dessa vela; ' +
    'a vela em que o analista não conseguiu decidir vem como `failed`, com o código estável e sem o texto do erro. Só ' +
    '`live_paper` com analista.',
  tag: 'Execuções — analista de risco',
  params: pathIdSchema(RUN_ID_PARAM),
  query: analystDecisionsQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'Uma página de decisões do analista, da mais recente para a mais antiga.',
      schema: z.array(ANALYST_DECISION_ITEM_SCHEMA),
      isList: true,
    },
  ],
  errors: ANALYST_ERRORS,
};
