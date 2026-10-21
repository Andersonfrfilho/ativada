// Copyright (c) 2026 Ada Technology. All rights reserved.
export const ME_MODEL_TEAMS_PATH = '/v1/me/model-teams';
export const ME_MODEL_TEAM_PATH = '/v1/me/model-teams/:teamKey';
export const RUN_MODEL_TEAMS_PATH = '/v1/runs/:runId/model-teams';
export const RUN_MODEL_TEAM_OPINIONS_PATH = '/v1/runs/:runId/model-teams/:teamKey/opinions';
export const RUN_MODEL_TEAM_QUESTIONS_PATH = '/v1/runs/:runId/model-teams/:teamKey/questions';
export const RUN_MODEL_TEAMS_QUESTIONS_PATH = '/v1/runs/:runId/model-teams/questions';
// A lista das perguntas livres da simulação: as 10 mais novas por padrão, no máximo 20.
export const MODEL_TEAM_QUESTION_PAGE = { DEFAULT: 10, MAXIMUM: 20 } as const;
export const MODEL_DUELS_PATH = '/v1/model-duels';
export const MODEL_DUEL_PATH = '/v1/model-duels/:duelId';
export const TEAM_KEY_PARAM = 'teamKey';
export const DUEL_ID_PARAM = 'duelId';

// O placar conta os últimos 30 dias; a ficha mostra as 3 últimas recomendações de cada equipe e a taxa de falha de 24 h.
export const MODEL_TEAM_SCOREBOARD_DAYS = 30;
export const MODEL_TEAM_RECENT_REPORTS = 3;
export const MODEL_TEAM_FAILURE_HOURS = 24;
// A comparação lado a lado: 24 velas por página (um dia em velas de 1 h; 6 h em velas de 15 min), no máximo 48.
export const MODEL_TEAM_COMPARISON_PAGE = { DEFAULT: 24, MAXIMUM: 48 } as const;
// Pedidos avulsos que a tela acompanha ao mesmo tempo.
export const MODEL_TEAM_MAX_TRACKED_OPINIONS = 6;

export const SIGNAL_SOURCE_FIELD = 'signalSource';
export const SIGNAL_SOURCE_REASON = {
  NOT_ALLOWED_WITH_SIGNAL_SOURCE: 'not_allowed_with_signal_source',
  REQUIRES_LIVE_PAPER: 'requires_live_paper',
  REQUIRES_15M: 'requires_15m_timeframe',
  STRATEGY_VERSION_REQUIRED: 'required_without_signal_source',
} as const;

export const DUEL_FIELD = {
  TEAMS: 'teams',
  SYMBOL: 'symbol',
  WITH_MY_STRATEGY: 'withMyStrategy',
} as const;
export const DUEL_REASON = {
  DUPLICATE_TEAM: 'duplicate_team',
  NOT_ENABLED: 'not_enabled',
} as const;
export const DUEL_MAX_TEAMS = 3;
