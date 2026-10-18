// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isModelTeamKey, type ModelTeamKey } from '@ativada/model-agents';

import type { ProtectedRouteContext } from '../router/route.types.js';
import { TEAM_KEY_PARAM } from './model-team.constant.js';
import { ModelTeamNotFoundError } from './model-team.error.js';

// Chave fora do catálogo é o mesmo 404 do que não existe: nunca vai para a consulta.
export function readTeamKey(context: ProtectedRouteContext): ModelTeamKey {
  const teamKey = context.pathParams[TEAM_KEY_PARAM];
  if (teamKey === undefined || !isModelTeamKey(teamKey)) throw new ModelTeamNotFoundError();
  return teamKey;
}
