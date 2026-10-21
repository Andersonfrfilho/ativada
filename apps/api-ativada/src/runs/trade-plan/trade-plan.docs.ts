// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import { pathIdSchema } from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { RUN_ID_PARAM } from '../runs.constant.js';
import { TRADE_PLAN_SCHEMA } from './trade-plan.schema.js';

export const tradePlanQuerySchema = z.strictObject({});

export const RUN_TRADE_PLAN_DOCUMENTATION: RouteDocumentation = {
  summary:
    'Plano de operação da simulação ao vivo (regra `trade-plan-1`; só `live_paper`, outro tipo responde 409 `RUN_NOT_LIVE`). ' +
    '`plan` é `awaiting_entry` (a compra simulada se a estratégia comprar na próxima vela: abertura estimada no tick, ' +
    'deslizamento, stop e alvo pelo ATR da vela decidida e a quantidade do dimensionamento do motor, com o líquido no alvo e no ' +
    'stop), `holding` (a posição gravada, vender agora a mercado e o líquido no alvo e no stop) ou `unavailable` com o motivo ' +
    '(`not_running`, `stalled`, `waiting_for_data`, `no_candle`, `no_atr`, `invalid_stop`) e nenhum número. `teams` traz uma ' +
    'linha por equipe de modelo LIGADA pelo dono: a última recomendação agendada decidida do par com as mesmas contas (ou o ' +
    'motivo `no_report`, `no_entry`, `invalid_levels`) e, na execução da própria equipe, a carteira dela. Tudo texto decimal: ' +
    'preços na grade do tick, dinheiro com os arredondamentos do motor (débito e taxa para cima, crédito para baixo) e taxas em ' +
    'fração a 12 casas contra o usuário (líquido para baixo; distância até o que se quer alcançar para cima, até o que se pode ' +
    'perder para baixo). `distance` parte de `currentPrice`, o último fechamento gravado. As frases não levam data nem hora. ' +
    'Nada reexecuta o motor: são as funções puras de preenchimento e dimensionamento sobre o que está gravado.',
  tag: 'Execuções — acompanhamento',
  params: pathIdSchema(RUN_ID_PARAM),
  query: tradePlanQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'O plano de operação estimado da simulação ao vivo e das equipes ligadas.',
      schema: TRADE_PLAN_SCHEMA,
    },
  ],
  errors: [
    { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
    { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_NOT_LIVE },
  ],
};
