// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { MODEL_TEAM_KEYS } from '@ativada/model-agents';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  MODEL_TEAM_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { TEAM_KEY_PARAM } from './model-team.constant.js';
import { TEAM_VIEW_SCHEMA } from './model-team-view.schema.js';

const TAG = 'Equipes de modelo';

export const updateMyModelTeamSchema = z.strictObject({ enabled: z.boolean() });
export const teamKeyParamsSchema = z.strictObject({ [TEAM_KEY_PARAM]: z.enum(MODEL_TEAM_KEYS) });
export const emptyQuerySchema = z.strictObject({});

export const MY_MODEL_TEAMS_SCHEMA = z.strictObject({
  notice: z.string(),
  teams: z.array(TEAM_VIEW_SCHEMA),
});

const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;
const TEAM_NOT_FOUND = {
  status: HTTP_STATUS.NOT_FOUND,
  code: MODEL_TEAM_ERROR_CODE.MODEL_TEAM_NOT_FOUND,
} as const;

export const MY_MODEL_TEAMS_DOCUMENTATION = {
  list: {
    summary:
      'As três equipes de modelo (Nina, Lucas e Olívia) com o interruptor do usuário (padrão desligada: usar custa dinheiro) e ' +
      'o estado do provedor pelo batimento do worker (`ready`, `no_key`, `budget_exhausted`, `circuit_open`, `key_rejected`, ' +
      '`model_not_found`; `null` = sem notícia do worker). Nunca traz chave, id de modelo nem preço.',
    tag: TAG,
    query: emptyQuerySchema,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'As equipes e o aviso fixo de que o modelo pode errar.',
        schema: MY_MODEL_TEAMS_SCHEMA,
      },
    ],
    errors: [VALIDATION],
  },
  update: {
    summary:
      'Liga ou desliga uma equipe de modelo para o usuário. Ligada, ela pode ser chamada para o par das simulações dele e entrar num ' +
      'duelo. Chave fora do catálogo responde 404.',
    tag: TAG,
    params: z.strictObject({ [TEAM_KEY_PARAM]: z.string() }),
    body: updateMyModelTeamSchema,
    successes: [
      { status: HTTP_STATUS.OK, description: 'A equipe já alterada.', schema: TEAM_VIEW_SCHEMA },
    ],
    errors: [VALIDATION, TEAM_NOT_FOUND],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
