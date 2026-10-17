// Copyright (c) 2026 Ada Technology. All rights reserved.
export const MODEL_TEAM_KEY = {
  NINA: 'nina',
  LUCAS: 'lucas',
  OLIVIA: 'olivia',
} as const;
export type ModelTeamKey = (typeof MODEL_TEAM_KEY)[keyof typeof MODEL_TEAM_KEY];

export const MODEL_PROVIDER = {
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  OPENAI: 'openai',
} as const;
export type ModelProvider = (typeof MODEL_PROVIDER)[keyof typeof MODEL_PROVIDER];

// Os três papéis internos, iguais nas três equipes (DT2): uma única chamada devolve os três.
export const TEAM_ROLE = {
  TREND: 'trend',
  RISK: 'risk',
  DECISION: 'decision',
} as const;
export type TeamRole = (typeof TEAM_ROLE)[keyof typeof TEAM_ROLE];

export const TEAM_ROLE_LABEL: Readonly<Record<TeamRole, string>> = {
  trend: 'Analista de tendência',
  risk: 'Analista de risco',
  decision: 'Gestor',
};

export type ModelTeamDefinition = {
  readonly key: ModelTeamKey;
  readonly displayName: string;
  readonly provider: ModelProvider;
  readonly modelFamily: string;
  readonly cloudLabel: string;
};

// Catálogo fechado (DT1): o id do modelo e o preço de cada equipe vêm do env, nunca daqui.
export const MODEL_TEAMS: Readonly<Record<ModelTeamKey, ModelTeamDefinition>> = {
  nina: {
    key: 'nina',
    displayName: 'Nina',
    provider: MODEL_PROVIDER.GOOGLE,
    modelFamily: 'Gemini Pro',
    cloudLabel: 'nuvem do Google',
  },
  lucas: {
    key: 'lucas',
    displayName: 'Lucas',
    provider: MODEL_PROVIDER.ANTHROPIC,
    modelFamily: 'Claude Sonnet',
    cloudLabel: 'nuvem da Anthropic',
  },
  olivia: {
    key: 'olivia',
    displayName: 'Olívia',
    provider: MODEL_PROVIDER.OPENAI,
    modelFamily: 'GPT',
    cloudLabel: 'nuvem da OpenAI',
  },
};

export const MODEL_TEAM_KEYS: readonly ModelTeamKey[] = [
  MODEL_TEAM_KEY.NINA,
  MODEL_TEAM_KEY.LUCAS,
  MODEL_TEAM_KEY.OLIVIA,
];

export function isModelTeamKey(value: unknown): value is ModelTeamKey {
  return MODEL_TEAM_KEYS.some((key) => key === value);
}
