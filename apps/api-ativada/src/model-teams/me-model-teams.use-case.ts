// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  OwnerScope,
  UserModelTeamRepository,
  WorkerHeartbeatRepository,
} from '@ativada/database';
import { MODEL_TEAM_KEYS, TEAM_NOTICE, type ModelTeamKey } from '@ativada/model-agents';

import { readProviderStates } from './provider-state.js';
import { toTeamView } from './model-team-view.js';
import type { TeamView } from './model-team-view.schema.js';

export type MyModelTeamsDependencies = {
  readonly teams: Pick<UserModelTeamRepository, 'listTeams' | 'setEnabled'>;
  readonly heartbeat: Pick<WorkerHeartbeatRepository, 'findLatest'>;
  readonly heartbeatSeconds: number;
};

export type MyModelTeamsView = { readonly notice: string; readonly teams: readonly TeamView[] };

export type ListMyModelTeamsUseCase = (scope: OwnerScope) => Promise<MyModelTeamsView>;
export type SetMyModelTeamUseCase = (
  scope: OwnerScope,
  params: { readonly teamKey: ModelTeamKey; readonly isEnabled: boolean },
) => Promise<TeamView>;

async function readTeams(
  dependencies: MyModelTeamsDependencies,
  scope: OwnerScope,
): Promise<readonly TeamView[]> {
  const [records, heartbeat] = await Promise.all([
    dependencies.teams.listTeams(scope),
    dependencies.heartbeat.findLatest(),
  ]);
  const states = readProviderStates({ heartbeat, heartbeatSeconds: dependencies.heartbeatSeconds });
  const enabled = new Set(
    records.filter((record) => record.isEnabled).map((record) => record.teamKey),
  );
  return MODEL_TEAM_KEYS.map((teamKey) =>
    toTeamView({ teamKey, isEnabled: enabled.has(teamKey), provider: states[teamKey] }),
  );
}

// O catálogo é fechado (3 equipes): o dono nunca vê chave nem preço, só o interruptor e o estado do provedor. O padrão é
// DESLIGADA (custo é opt-in). Outro usuário nunca aparece: a lista é do dono, por `OwnerScope`.
export function createListMyModelTeamsUseCase(
  dependencies: MyModelTeamsDependencies,
): ListMyModelTeamsUseCase {
  return async (scope) => ({ notice: TEAM_NOTICE, teams: await readTeams(dependencies, scope) });
}

export function createSetMyModelTeamUseCase(
  dependencies: MyModelTeamsDependencies,
): SetMyModelTeamUseCase {
  return async (scope, params) => {
    await dependencies.teams.setEnabled(scope, params);
    const teams = await readTeams(dependencies, scope);
    const updated = teams.find((team) => team.teamKey === params.teamKey);
    if (updated === undefined) throw new Error('Equipe do catálogo ausente da lista.');
    return updated;
  };
}
