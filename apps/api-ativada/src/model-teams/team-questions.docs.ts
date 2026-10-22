// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { pathIdSchema, resourceIdSchema } from '../openapi/schema-primitives.js';
import { RUN_ID_PARAM } from '../runs/runs.constant.js';
import {
  MODEL_TEAM_ERROR_CODE,
  RUN_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { TEAM_KEY_PARAM } from './model-team.constant.js';
import {
  QUESTION_REQUESTED_SCHEMA,
  TEAM_QUESTIONS_SCHEMA,
  teamQuestionsQuerySchema,
} from './team-questions.schema.js';

const TAG = 'Execuções — equipes de modelo';
const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;
const RUN_NOT_FOUND = {
  status: HTTP_STATUS.NOT_FOUND,
  code: RUN_ERROR_CODE.RUN_NOT_FOUND,
} as const;
const RUN_NOT_LIVE = { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_NOT_LIVE } as const;

const ASK_SUMMARY =
  'Pergunta LIVRE a uma equipe de modelo (adendo da spec 015), numa simulação ao vivo do dono. `question` (3 a 280 ' +
  'caracteres, aparada) VAI AO PROVEDOR da equipe junto dos dados públicos de mercado do par `symbol` (as mesmas 48 velas ' +
  'de 15 min, leituras e Fear & Greed do relatório agendado); nome, e-mail, saldo e posição do usuário NUNCA vão. O worker ' +
  'recusa sem chamar o provedor a pergunta com e-mail, CPF, telefone, cartão ou sequência longa de dígitos ' +
  '(`QUESTION_HAS_PERSONAL_DATA`). A resposta volta em texto (pt-BR, até 600 caracteres; ordem ou promessa vira `hidden` ' +
  'com a frase fixa) e o custo entra no mesmo teto diário e mensal dos relatórios. Devolve o id para acompanhar em ' +
  '`GET /v1/runs/:runId/model-teams/questions`. Recusas: execução alheia ou inexistente 404; não ao vivo 409 ' +
  '`RUN_NOT_LIVE`; equipe desligada 409 `MODEL_TEAM_DISABLED`; provedor indisponível 409 `MODEL_TEAM_UNAVAILABLE`; teto ' +
  'diário do usuário (`MODEL_TEAM_QUESTION_PER_USER_PER_DAY`) 429 `MODEL_QUESTION_LIMIT_REACHED`. Não é recomendação.';

const LIST_SUMMARY =
  'As últimas perguntas livres do DONO nesta simulação ao vivo, da mais nova (`limit` de 1 a 20, padrão 10): `status` ' +
  '`pending` (o painel consulta de novo), `answered`, `hidden` (a frase fixa no lugar da resposta) ou `failed` com ' +
  '`failureCode` (`BUDGET_EXHAUSTED`, `CIRCUIT_OPEN`, `NO_KEY`, `QUESTION_HAS_PERSONAL_DATA`, `TIMEOUT`...). `costUsd` em ' +
  'texto decimal. Execução alheia ou inexistente 404; não ao vivo 409 `RUN_NOT_LIVE`.';

const LIST_DOCUMENTATION: RouteDocumentation = {
  summary: LIST_SUMMARY,
  tag: TAG,
  params: pathIdSchema(RUN_ID_PARAM),
  query: teamQuestionsQuerySchema,
  successes: [
    {
      status: HTTP_STATUS.OK,
      description: 'As perguntas e respostas, da mais nova.',
      schema: TEAM_QUESTIONS_SCHEMA,
    },
  ],
  errors: [VALIDATION, RUN_NOT_FOUND, RUN_NOT_LIVE],
};

function createAskDocumentation(body: z.ZodType): RouteDocumentation {
  return {
    summary: ASK_SUMMARY,
    tag: TAG,
    params: z.strictObject({ [RUN_ID_PARAM]: resourceIdSchema, [TEAM_KEY_PARAM]: z.string() }),
    body,
    successes: [
      {
        status: HTTP_STATUS.ACCEPTED,
        description: 'A pergunta entrou na fila; acompanhe pela lista.',
        schema: QUESTION_REQUESTED_SCHEMA,
      },
    ],
    errors: [
      VALIDATION,
      RUN_NOT_FOUND,
      { status: HTTP_STATUS.NOT_FOUND, code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_NOT_FOUND },
      RUN_NOT_LIVE,
      { status: HTTP_STATUS.CONFLICT, code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_DISABLED },
      { status: HTTP_STATUS.CONFLICT, code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_UNAVAILABLE },
      {
        status: HTTP_STATUS.TOO_MANY_REQUESTS,
        code: MODEL_TEAM_ERROR_CODE.MODEL_QUESTION_LIMIT_REACHED,
      },
    ],
  };
}

export function createTeamQuestionsDocumentation(body: z.ZodType): {
  readonly ask: RouteDocumentation;
  readonly list: RouteDocumentation;
} {
  return { ask: createAskDocumentation(body), list: LIST_DOCUMENTATION };
}
