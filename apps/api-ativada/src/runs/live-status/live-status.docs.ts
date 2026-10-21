// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import { pathIdSchema } from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { RUN_ID_PARAM } from '../runs.constant.js';
import { LIVE_STATUS_SCHEMA } from './live-status.schema.js';

export const liveStatusQuerySchema = z.strictObject({});

export const RUN_LIVE_STATUS_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Acompanhamento da simulação ao vivo numa resposta só (só `live_paper`; outro tipo responde 409 `RUN_NOT_LIVE`): ' +
    'saldo, resultado e comparação com "comprar e segurar" (decimal exato, arredondado contra o usuário), progresso da ' +
    'meta (alvo, prazo, quanto falta e quanto ainda cabe de queda), a posição aberta com alvo e stop, o que falta para ' +
    'comprar ou vender agora (calculado das leituras gravadas das duas últimas velas, sem reexecutar o motor) e a primeira ' +
    'página das 24 decisões mais recentes, esperas incluídas, com a frase do motivo. As frases não levam data nem hora: ' +
    'os instantes vêm em ms UTC e o painel monta o horário no fuso do usuário.',
  tag: 'Execuções — acompanhamento',
  params: pathIdSchema(RUN_ID_PARAM),
  query: liveStatusQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'O estado atual da simulação ao vivo.',
      schema: LIVE_STATUS_SCHEMA,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
    { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_NOT_LIVE },
  ],
};
