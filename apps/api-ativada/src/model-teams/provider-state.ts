// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonValue, LatestWorkerHeartbeat } from '@ativada/database';
import { z } from '@ativada/environment';
import {
  describeProviderState,
  MODEL_TEAM_KEY,
  PROVIDER_STATE,
  WORKER_OFFLINE_PHRASE,
  type ModelTeamKey,
  type ProviderState,
} from '@ativada/model-agents';

import { toWorkerHealth, WORKER_STATE } from '../health/health-view.js';

const teamStatusSchema = z.object({
  keyConfigured: z.boolean(),
  modelConfigured: z.boolean(),
  providerState: z.enum(Object.values(PROVIDER_STATE)),
  circuitUntil: z.string().nullable(),
});

// O que a API sabe de um provedor pelo batimento do worker. `state` nulo = sem notícia (worker parado, nunca ligado ou batida
// sem o resumo): a tela diz isso e o pedido avulso não vai.
export type TeamProviderStatus = {
  readonly state: ProviderState | null;
  readonly keyConfigured: boolean;
  readonly modelConfigured: boolean;
  readonly circuitUntil: string | null;
  readonly message: string;
  readonly isAvailable: boolean;
};

const UNKNOWN_STATUS: TeamProviderStatus = {
  state: null,
  keyConfigured: false,
  modelConfigured: false,
  circuitUntil: null,
  message: WORKER_OFFLINE_PHRASE,
  isAvailable: false,
};

function readEntry(summary: JsonValue | undefined, teamKey: ModelTeamKey): unknown {
  if (typeof summary !== 'object' || summary === null || Array.isArray(summary)) return undefined;
  return Object.getOwnPropertyDescriptor(summary, teamKey)?.value;
}

function toStatus(entry: z.infer<typeof teamStatusSchema>): TeamProviderStatus {
  return {
    state: entry.providerState,
    keyConfigured: entry.keyConfigured,
    modelConfigured: entry.modelConfigured,
    circuitUntil: entry.circuitUntil,
    // A hora de voltar é formatada pela tela no fuso do usuário; aqui a marca fica no texto.
    message: describeProviderState(entry.providerState, '{hora}'),
    isAvailable: entry.providerState === PROVIDER_STATE.READY,
  };
}

export type ProviderStateParams = {
  readonly heartbeat: LatestWorkerHeartbeat | undefined;
  readonly heartbeatSeconds: number;
};

// O resumo das três equipes (RF23). Worker parado vale "sem notícia": o último estado gravado pode estar velho.
export function readProviderStates(
  params: ProviderStateParams,
): Readonly<Record<ModelTeamKey, TeamProviderStatus>> {
  const health = toWorkerHealth(params);
  const summary = health.state === WORKER_STATE.ALIVE ? params.heartbeat?.modelTeams : undefined;
  const statusOf = (teamKey: ModelTeamKey): TeamProviderStatus => {
    const parsed = teamStatusSchema.safeParse(readEntry(summary, teamKey));
    return parsed.success ? toStatus(parsed.data) : UNKNOWN_STATUS;
  };
  return {
    [MODEL_TEAM_KEY.NINA]: statusOf(MODEL_TEAM_KEY.NINA),
    [MODEL_TEAM_KEY.LUCAS]: statusOf(MODEL_TEAM_KEY.LUCAS),
    [MODEL_TEAM_KEY.OLIVIA]: statusOf(MODEL_TEAM_KEY.OLIVIA),
  };
}
