// Copyright (c) 2026 Ada Technology. All rights reserved.
export const STRATEGIES_PATH = '/v1/strategies';
export const STRATEGY_PATH = '/v1/strategies/:strategyId';
export const STRATEGY_VERSIONS_PATH = '/v1/strategies/:strategyId/versions';
export const STRATEGY_ID_PARAM = 'strategyId';

// Espelha `strategies.name varchar(120)`: o banco recusaria acima disto.
export const STRATEGY_NAME_MAX_LENGTH = 120;

export const UNKNOWN_FIELD_REASON = 'unknown_field';
