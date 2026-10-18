// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { TEAM_ROOM_STORAGE_KEY } from './team-room.constant.js';

export const TEAM_LAYOUT = {
  CHART_AND_TEAM: 'chart_and_team',
  ROOM_WITH_CHART: 'room_with_chart',
} as const;

export type TeamLayout = (typeof TEAM_LAYOUT)[keyof typeof TEAM_LAYOUT];

// O cenário do escritório: isométrico com a equipe andando (padrão) ou a vista frontal simples e mais leve.
export const OFFICE_VIEW = { WALKING: 'walking', FRONT: 'front' } as const;

export type OfficeView = (typeof OFFICE_VIEW)[keyof typeof OFFICE_VIEW];

const DEFAULTS = {
  isCollapsed: true,
  isAnimationOn: true,
  layout: TEAM_LAYOUT.CHART_AND_TEAM,
  officeView: OFFICE_VIEW.WALKING,
} as const;

// Preferência de tela, nada da simulação: sala recolhida, animação, a escolha entre "Gráfico + equipe" e "Sala com o gráfico"
// e o cenário do escritório.
const preferenceSchema = z.object({
  isCollapsed: z.boolean().catch(DEFAULTS.isCollapsed),
  isAnimationOn: z.boolean().catch(DEFAULTS.isAnimationOn),
  layout: z.enum([TEAM_LAYOUT.CHART_AND_TEAM, TEAM_LAYOUT.ROOM_WITH_CHART]).catch(DEFAULTS.layout),
  officeView: z.enum([OFFICE_VIEW.WALKING, OFFICE_VIEW.FRONT]).catch(DEFAULTS.officeView),
});

export type TeamRoomPreference = z.infer<typeof preferenceSchema>;
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const DEFAULT_TEAM_ROOM_PREFERENCE: TeamRoomPreference = DEFAULTS;

function defaultStorage(): PreferenceStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function parseStored(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

// Armazenamento indisponível, JSON quebrado ou valor inválido caem no padrão, campo a campo.
export function readTeamRoomPreference(
  storage: PreferenceStorage | undefined = defaultStorage(),
): TeamRoomPreference {
  try {
    const parsed = preferenceSchema.safeParse(
      parseStored(storage?.getItem(TEAM_ROOM_STORAGE_KEY) ?? null),
    );
    return parsed.success ? parsed.data : DEFAULT_TEAM_ROOM_PREFERENCE;
  } catch {
    return DEFAULT_TEAM_ROOM_PREFERENCE;
  }
}

export function writeTeamRoomPreference(
  preference: TeamRoomPreference,
  storage: PreferenceStorage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(TEAM_ROOM_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    return;
  }
}
