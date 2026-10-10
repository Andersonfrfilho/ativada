// Copyright (c) 2026 Ada Technology. All rights reserved.
export const RUNS_PATH = '/v1/runs';
export const RUN_PATH = '/v1/runs/:runId';
export const RUN_STOP_PATH = '/v1/runs/:runId/stop';
export const RUN_EQUITY_PATH = '/v1/runs/:runId/equity';
export const RUN_TRADES_PATH = '/v1/runs/:runId/trades';
export const RUN_SIGNALS_PATH = '/v1/runs/:runId/signals';
export const RUN_ORDERS_PATH = '/v1/runs/:runId/orders';
export const RUN_FILLS_PATH = '/v1/runs/:runId/fills';
export const RUN_WINDOWS_PATH = '/v1/runs/:runId/windows';
export const RUN_EXPORT_PATH = '/v1/runs/:runId/export.csv';
export const RUN_LOG_EXPORT_PATH = '/v1/runs/:runId/log.csv';
export const RUN_ID_PARAM = 'runId';

// Gravado em `runs.error_code` quando a execução não chegou a ser entregue ao executor (ADR 0002, T3.4).
export const RUN_STORED_ERROR_CODE = { DISPATCH_FAILED: 'DISPATCH_FAILED' } as const;

// Sem observação gravada para a fonte, o sentimento vota 0 (dado ausente, ADR 0002 §f).
export const DEFAULT_SENTIMENT_SOURCE = 'alternative.me';
export const RUN_PARAMETERS_SCHEMA_VERSION_VALUE = 1;

export const RUN_FIELD = {
  RUN_PARAMETERS: 'runParameters',
  PERIOD_START: 'periodStart',
  SURVIVAL: 'survival',
  GRID: 'grid',
  WINDOWS: 'windows',
  PERIOD_END: 'periodEnd',
} as const;

export const RUN_REASON = {
  REQUIRED: 'required',
  INVALID_VALUE: 'invalid_value',
  PERIOD_END_MUST_BE_AFTER_START: 'must_be_after_period_start',
  NOT_ENABLED: 'not_enabled',
  GRID_REQUIRED: 'required_for_walk_forward',
  NOT_ALLOWED_FOR_KIND: 'not_allowed_for_kind',
  UNKNOWN_FIELD: 'unknown_field',
} as const;

export const INVALID_GRID_MESSAGE =
  'A grade é inválida: confira os caminhos, o tipo dos valores e o limite de parâmetros.';
