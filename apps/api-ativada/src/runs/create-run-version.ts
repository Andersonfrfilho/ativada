// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, StrategyRepository, UserModelTeamRepository } from '@ativada/database';
import {
  MODEL_TEAM_STRATEGY,
  MODEL_TEAM_STRATEGY_NAME,
  type SignalSource,
} from '@ativada/model-agents';
import { parseJsonContainer } from '@ativada/run-recording';

import { ModelTeamDisabledError } from '../model-teams/model-team.error.js';
import { StrategyVersionNotFoundError } from '../strategies/strategy.error.js';
import type { CreateRunBody } from './create-run-request.schema.js';

export type RunVersionDependencies = {
  readonly strategies: Pick<StrategyRepository, 'findVersion' | 'ensureSystemStrategyVersion'>;
  readonly teams: Pick<UserModelTeamRepository, 'listTeams'>;
};

export type RequestedVersion = { readonly id: string; readonly config: unknown };

// A versão pedida pelo corpo (do dono; alheia e inexistente são o mesmo 404). Execução de equipe não pede versão: a fixa é
// achada depois da admissão.
export async function findRequestedVersion(
  dependencies: RunVersionDependencies,
  scope: OwnerScope,
  body: CreateRunBody,
): Promise<RequestedVersion | undefined> {
  if (body.signalSource !== undefined) return undefined;
  const version =
    body.strategyVersionId === undefined
      ? undefined
      : await dependencies.strategies.findVersion(scope, body.strategyVersionId);
  if (version === undefined) throw new StrategyVersionNotFoundError();
  return { id: version.id, config: version.config };
}

// Equipe desligada nas preferências: custo é opt-in, então a execução de equipe não nasce (409).
export async function assertTeamEnabled(
  dependencies: RunVersionDependencies,
  scope: OwnerScope,
  source: SignalSource | undefined,
): Promise<void> {
  if (source === undefined) return;
  const records = await dependencies.teams.listTeams(scope);
  if (!records.some((row) => row.teamKey === source.team && row.isEnabled)) {
    throw new ModelTeamDisabledError();
  }
}

// A `model-team-1` DO USUÁRIO, achada ou criada pelo hash numa transação: fora da lista de estratégias e do teto delas.
export async function ensureTeamVersion(
  dependencies: RunVersionDependencies,
  scope: OwnerScope,
): Promise<RequestedVersion> {
  const version = await dependencies.strategies.ensureSystemStrategyVersion(scope, {
    name: MODEL_TEAM_STRATEGY_NAME,
    config: parseJsonContainer(JSON.stringify(MODEL_TEAM_STRATEGY.config)),
    configHash: MODEL_TEAM_STRATEGY.configHash,
  });
  return { id: version.id, config: version.config };
}
