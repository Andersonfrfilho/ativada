// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer } from '@ativada/database';
import { MODEL_TEAM_KEYS, PROVIDER_STATE, type ModelTeamKey } from '@ativada/model-agents';

import type { TeamRuntime } from './build-team-runtimes.js';
import type { TeamCircuits } from './team-circuits.js';

export type ProviderStatusDependencies = {
  readonly runtimes: readonly TeamRuntime[];
  readonly circuits: TeamCircuits;
  readonly now: () => number;
};

type TeamStatus = {
  readonly keyConfigured: boolean;
  readonly modelConfigured: boolean;
  readonly providerState: string;
  readonly circuitUntil: string | null;
};

const UNCONFIGURED: TeamStatus = {
  keyConfigured: false,
  modelConfigured: false,
  providerState: PROVIDER_STATE.NO_KEY,
  circuitUntil: null,
};

function statusOf(dependencies: ProviderStatusDependencies, teamKey: ModelTeamKey): TeamStatus {
  const view = dependencies.circuits.describe(teamKey, dependencies.now());
  return {
    keyConfigured: true,
    modelConfigured: true,
    providerState: view.providerState,
    circuitUntil:
      view.retryAtMilliseconds === null ? null : new Date(view.retryAtMilliseconds).toISOString(),
  };
}

// O resumo que vai ao batimento (RF23): SÓ booleanos, estado e instante. Nunca chave, id de modelo, URL nem texto de erro.
export function buildProviderStatus(dependencies: ProviderStatusDependencies): JsonContainer {
  const configured = new Set<ModelTeamKey>(dependencies.runtimes.map((runtime) => runtime.teamKey));
  const entries = MODEL_TEAM_KEYS.map(
    (teamKey) =>
      [teamKey, configured.has(teamKey) ? statusOf(dependencies, teamKey) : UNCONFIGURED] as const,
  );
  return Object.fromEntries(entries);
}
