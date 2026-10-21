// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { resourceIdSchema } from '../openapi/schema-primitives.js';
import {
  MODEL_TEAM_ERROR_CODE,
  RUN_ERROR_CODE,
  STRATEGY_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { DUEL_ID_PARAM } from './model-team.constant.js';
import { CREATE_MODEL_DUEL_SCHEMA, MODEL_DUEL_SCHEMA } from './model-duel.schema.js';

const TAG = 'Duelos de equipes de modelo';
const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;

export const MODEL_DUEL_DOCUMENTATION = {
  create: {
    summary:
      'Cria o duelo (RF13): uma simulação ao vivo por equipe escolhida (e, se pedido, uma da estratégia de regras do usuário), todas no ' +
      'mesmo par, na mesma vela de 15 min, com o mesmo saldo fictício. As equipes precisam estar ligadas e o usuário precisa ter vaga ' +
      'para TODAS as simulações, senão nada é criado: 409 `MODEL_TEAM_DISABLED` ou `LIVE_RUN_LIMIT_REACHED`. Tudo simulado; nenhuma ordem ' +
      'real. Período curto não prova nada.',
    tag: TAG,
    body: z.strictObject({
      symbol: z.string(),
      startingBalance: z.string(),
      teams: z.array(z.string()),
      withMyStrategy: z.strictObject({ strategyVersionId: resourceIdSchema }).optional(),
    }),
    successes: [
      {
        status: HTTP_STATUS.CREATED,
        description: 'O duelo criado.',
        schema: CREATE_MODEL_DUEL_SCHEMA,
      },
    ],
    errors: [
      VALIDATION,
      { status: HTTP_STATUS.NOT_FOUND, code: STRATEGY_ERROR_CODE.STRATEGY_VERSION_NOT_FOUND },
      { status: HTTP_STATUS.CONFLICT, code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_DISABLED },
      { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.LIVE_RUN_LIMIT_REACHED },
      { status: HTTP_STATUS.CONFLICT, code: RUN_ERROR_CODE.RUN_STORAGE_QUOTA_REACHED },
    ],
  },
  get: {
    summary:
      'O duelo: as simulações do grupo, as curvas de patrimônio alinhadas por vela (uma posição por vela, `null` onde a simulação ainda não ' +
      'tem ponto) e o ranking com retorno, perda máxima na mínima, operações, o acerto de lado das equipes (Wilson) e o custo de API ' +
      'estimado. Mesmo par, mesma vela, mesmo saldo fictício; período curto não prova nada.',
    tag: TAG,
    params: z.strictObject({ [DUEL_ID_PARAM]: resourceIdSchema }),
    successes: [{ status: HTTP_STATUS.OK, description: 'O duelo.', schema: MODEL_DUEL_SCHEMA }],
    errors: [{ status: HTTP_STATUS.NOT_FOUND, code: MODEL_TEAM_ERROR_CODE.DUEL_NOT_FOUND }],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
