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
import { COMPARISON_SCHEMA, comparisonQuerySchema } from './run-model-teams-comparison.schema.js';
import { RUN_MODEL_TEAMS_SCHEMA, runModelTeamsQuerySchema } from './run-model-teams.schema.js';

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

export const OPINION_REQUESTED_SCHEMA = z.strictObject({ opinionId: resourceIdSchema });

export const RUN_MODEL_TEAMS_DOCUMENTATION = {
  state: {
    summary:
      'O estado das equipes de modelo na sala da simulação (spec 015): por equipe, o interruptor do usuário, o estado do provedor, ' +
      'as últimas recomendações agendadas (ação, níveis, os três papéis e o rodapé "gerado por modelo"), o placar de acertos de ' +
      'lado contra a moeda ao ar (Wilson, últimos 30 dias), o custo estimado de hoje e do mês e a taxa de falha de 24 h. ' +
      '`opinionIds` (separados por vírgula, no máximo seis) traz os pedidos avulsos que o cliente acompanha. O modelo pode errar e ' +
      'nada aqui é recomendação. Só `live_paper`; outro tipo responde 409 `RUN_NOT_LIVE`.',
    tag: TAG,
    params: pathIdSchema(RUN_ID_PARAM),
    query: runModelTeamsQuerySchema,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'O estado das equipes.',
        schema: RUN_MODEL_TEAMS_SCHEMA,
      },
    ],
    errors: [VALIDATION, RUN_NOT_FOUND, RUN_NOT_LIVE],
  },
  comparison: {
    summary:
      'A tabela "Equipes × regras": uma linha por vela de 15 min, da mais nova (24 por página, no máximo 48, por cursor), com os ' +
      'votos dos especialistas de regra (quando a simulação tem analista), a ação de cada equipe e o que a vela seguinte fez ' +
      '(`up`, `down`, `equal` ou `open`), com ✓/✗ só onde houve lado. Compara acerto de lado, não lucro.',
    tag: TAG,
    params: pathIdSchema(RUN_ID_PARAM),
    query: comparisonQuerySchema,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Uma página da comparação, da vela mais nova para a mais antiga.',
        schema: COMPARISON_SCHEMA,
        isList: true,
      },
    ],
    errors: [VALIDATION, RUN_NOT_FOUND, RUN_NOT_LIVE],
  },
  opinion: {
    summary:
      '"Pedir opinião agora" (RF20): enfileira um relatório AVULSO da equipe sobre a última vela fechada do par e devolve o id para ' +
      'acompanhá-lo em `opinionIds`. Passa pelo mesmo despachante, teto de custo e circuito, aparece marcado "pedido avulso" e nunca ' +
      'comanda ordem nem entra no placar. Recusas: simulação alheia ou inexistente 404; não ao vivo 409 `RUN_NOT_LIVE`; sem ' +
      'analista 409 `ANALYST_NOT_ENABLED`; parada 409 `RUN_NOT_RUNNING`; equipe desligada 409 `MODEL_TEAM_DISABLED`; provedor ' +
      'indisponível 409 `MODEL_TEAM_UNAVAILABLE`; teto diário do usuário 429 `MODEL_OPINION_LIMIT_REACHED`.',
    tag: TAG,
    params: z.strictObject({ [RUN_ID_PARAM]: resourceIdSchema, [TEAM_KEY_PARAM]: z.string() }),
    successes: [
      {
        status: HTTP_STATUS.ACCEPTED,
        description: 'O pedido entrou na fila; acompanhe pelo id.',
        schema: OPINION_REQUESTED_SCHEMA,
      },
    ],
    errors: [
      VALIDATION,
      RUN_NOT_FOUND,
      { status: HTTP_STATUS.NOT_FOUND, code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_NOT_FOUND },
      RUN_NOT_LIVE,
      { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.ANALYST_NOT_ENABLED },
      { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_NOT_RUNNING },
      { status: HTTP_STATUS.CONFLICT, code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_DISABLED },
      { status: HTTP_STATUS.CONFLICT, code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_UNAVAILABLE },
      {
        status: HTTP_STATUS.TOO_MANY_REQUESTS,
        code: MODEL_TEAM_ERROR_CODE.MODEL_OPINION_LIMIT_REACHED,
      },
    ],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
