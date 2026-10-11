// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ENGINE_TIMEFRAME } from '@cryptoada/strategy-engine';

export const GOALS_PATH = '/v1/goals';
export const GOAL_PATH = '/v1/goals/:goalId';
export const GOAL_EVALUATION_PATH = '/v1/goals/:goalId/evaluation';
export const GOAL_PLAN_PATH = '/v1/goals/:goalId/plan';
export const GOAL_ID_PARAM = 'goalId';

// Teto de metas por usuário (RF00b): um usuário não enche o banco nem a avaliação dos outros.
export const MAX_GOALS_PER_USER = 20;

// A avaliação roda sobre candles diários: o passo de 1 candle por janela custa ~15 mil passos de carteira por par e
// estratégia em 2 anos diários, e dá ~120 mil em `4h` (ADR 0002 §"Metas (T4b.3)").
export const GOAL_EVALUATION_TIMEFRAME = ENGINE_TIMEFRAME.ONE_DAY;
// As estratégias mais novas do dono que entram na avaliação: o custo cresce com estratégias × pares, e a resposta é
// síncrona (cache por candle novo).
export const GOAL_EVALUATION_MAX_STRATEGIES = 5;
// 2 anos de janelas mais o aquecimento do indicador mais longo: o que o banco tiver a partir daqui.
export const GOAL_HISTORY_DAYS = 1_100;
export const GOAL_CACHE_MAX_ENTRIES = 1_000;
export const GOAL_INITIAL_BALANCE = '10000';
export const GOAL_REASON = { NOT_ENABLED: 'not_enabled', INVALID_VALUE: 'invalid_value' } as const;
