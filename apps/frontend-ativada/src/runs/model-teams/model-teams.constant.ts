// Copyright (c) 2026 Ada Technology. All rights reserved.
// Espelho do catálogo FECHADO das equipes de modelo (spec 015): o painel não importa código de outra app.
export const MODEL_TEAM_KEYS = ['nina', 'lucas', 'olivia'] as const;
export type ModelTeamKey = (typeof MODEL_TEAM_KEYS)[number];

export const MODEL_PROVIDERS = ['anthropic', 'google', 'openai'] as const;

export const PROVIDER_STATES = [
  'ready',
  'no_key',
  'budget_exhausted',
  'circuit_open',
  'key_rejected',
  'model_not_found',
] as const;
export type ProviderState = (typeof PROVIDER_STATES)[number];

export const TEAM_ACTIONS = ['buy', 'sell', 'hold'] as const;
export type TeamAction = (typeof TEAM_ACTIONS)[number];

export const RECOMMENDATION_STATUSES = ['decided', 'failed', 'skipped', 'pending'] as const;
export const VERDICTS = ['above', 'even', 'below', 'too_few'] as const;
export const NEXT_MOVES = ['up', 'down', 'equal', 'open'] as const;

export const MODEL_TEAM_PATH = {
  MINE: '/v1/me/model-teams',
  DUELS: '/v1/model-duels',
} as const;

export const MODEL_TEAMS_QUERY_ROOT = 'model-teams';
export const MY_MODEL_TEAMS_KEY = ['me', MODEL_TEAMS_QUERY_ROOT] as const;
export const DUEL_QUERY_ROOT = 'model-duels';

// Menos que isto de recomendações contadas, o placar diz "poucas previsões" (a regra do Wilson da casa).
export const SCOREBOARD_MINIMUM = 30;

export const MODEL_TEAM_VISUAL: Readonly<
  Record<
    ModelTeamKey,
    { readonly name: string; readonly initial: string; readonly provider: string }
  >
> = {
  nina: { name: 'Nina', initial: 'N', provider: 'Gemini' },
  lucas: { name: 'Lucas', initial: 'L', provider: 'Claude' },
  olivia: { name: 'Olívia', initial: 'O', provider: 'OpenAI' },
};

export const MODEL_TEAM_ROLES = [
  { key: 'trend', label: 'Analista de tendência' },
  { key: 'risk', label: 'Analista de risco' },
  { key: 'decision', label: 'Gestor' },
] as const;

export const TREND_WORD = { up: 'alta', down: 'queda', neutral: 'lateral' } as const;
export const RISK_WORD = { low: 'baixo', medium: 'médio', high: 'alto' } as const;
