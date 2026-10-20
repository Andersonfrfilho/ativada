// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from '@ativada/environment';

import type { RouteDocumentation } from '../../openapi/route-documentation.types.js';
import { pathIdSchema } from '../../openapi/schema-primitives.js';
import { RUN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../../shared/http/http.constant.js';
import { RUN_ID_PARAM } from '../runs.constant.js';
import { QUESTION_ANSWER_SCHEMA } from './questions.schema.js';

export function createQuestionsDocumentation(query: z.ZodType): RouteDocumentation {
  return {
    summary:
      'Pergunte à equipe (regra `questions-1`; só `live_paper`, outro tipo responde 409 `RUN_NOT_LIVE`). `question` é uma das ' +
      'perguntas rápidas da sala: `trend` (Tiago, a regra de tendência, EMA de preferência), `stretch` (Renata, a de reversão, ' +
      'RSI de preferência), `volume` (Vitor, OBV), `sentiment` (Sofia, Fear & Greed), `entry_gap` (Alice, o que falta no placar ' +
      'para comprar), `plan` (Alice, o plano de operação) e `track_record` (Otávio, o acerto da previsão contra a moeda ao ar). ' +
      '`symbol` é qualquer par habilitado: as leituras saem das últimas 500 velas FECHADAS dele no timeframe da execução, com a ' +
      'estratégia da execução e as mesmas funções do próximo gatilho (nada recalcula indicador de outro jeito), em cache por versão, ' +
      'par, timeframe e última vela. `plan` e `track_record` só existem para o par da execução (outro par recebe a frase que diz ' +
      'isso). `answer` é uma frase do catálogo fechado do servidor, com os números em pt-BR e sem data nem hora; `basis` ' +
      '`indicative` quando o indicador se move com a próxima vela ou o número é estimativa; `asOf` é a vela lida (nula sem ' +
      'nenhuma: "Sem dados de <par> ainda."). Não é recomendação de compra ou venda.',
    tag: 'Execuções — acompanhamento',
    params: pathIdSchema(RUN_ID_PARAM),
    query,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'A resposta do agente da sala, lida das velas gravadas do par.',
        schema: QUESTION_ANSWER_SCHEMA,
      },
    ],
    errors: [
      { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
      { status: HTTP_STATUS.NOT_FOUND, code: RUN_ERROR_CODE.RUN_NOT_FOUND },
      { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_NOT_LIVE },
    ],
  };
}
