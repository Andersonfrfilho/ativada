// Copyright (c) 2026 Ada Technology. All rights reserved.
export const HORIZON_QUERY_ROOT = 'horizons';
// A avaliação é pesada e a API limita a 20 por minuto: dentro desta janela a tela não pede de novo.
export const HORIZON_STALE_MILLISECONDS = 60_000;

export const HORIZON_PARAM = { SYMBOL: 'symbol', STRATEGY: 'strategyId' } as const;

export const HORIZON_ROW_KIND = { INTRADAY: 'intraday', DAILY: 'daily' } as const;
export const INTRADAY_VERDICT = { WORTH: 'COMPENSA', NOT_WORTH: 'NAO_COMPENSA' } as const;

export const BEST_STRATEGY_VALUE = '';
export const BEST_STRATEGY_LABEL = 'Melhor por prazo';
