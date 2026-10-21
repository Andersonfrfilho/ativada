// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { MODEL_TEAM_KEYS, type ModelTeamKey } from './model-team-catalog.constant.js';

export const SIGNAL_SOURCE_KIND = { MODEL_TEAM: 'model_team' } as const;
export const SIGNAL_SOURCE_PROPERTY = 'signalSource';

export const signalSourceSchema = z.strictObject({
  kind: z.literal(SIGNAL_SOURCE_KIND.MODEL_TEAM),
  team: z.enum(MODEL_TEAM_KEYS),
});

// O que fica em `runs.request.signalSource`: a execução cuja decisão vem da linha gravada da equipe (plan D9).
export type SignalSource = {
  readonly kind: typeof SIGNAL_SOURCE_KIND.MODEL_TEAM;
  readonly team: ModelTeamKey;
};

function readOwnProperty(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return Object.getOwnPropertyDescriptor(value, name)?.value;
}

// Lê o pedido GRAVADO da execução: `undefined` = execução de regra (ou pedido que não se entende, que nunca vira equipe).
export function readSignalSource(request: unknown): SignalSource | undefined {
  const parsed = signalSourceSchema.safeParse(readOwnProperty(request, SIGNAL_SOURCE_PROPERTY));
  return parsed.success ? parsed.data : undefined;
}

export const DUEL_PROPERTY = 'duel';

const duelRequestSchema = z.strictObject({ groupId: z.uuid() });

// O grupo do duelo gravado em `runs.request.duel`: o vínculo entre as execuções de um mesmo duelo (spec 015 RF13).
export function readDuelGroupId(request: unknown): string | undefined {
  const parsed = duelRequestSchema.safeParse(readOwnProperty(request, DUEL_PROPERTY));
  return parsed.success ? parsed.data.groupId : undefined;
}
