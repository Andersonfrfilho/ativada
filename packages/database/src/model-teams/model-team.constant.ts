// Copyright (c) 2026 Ada Technology. All rights reserved.

// Os valores espelham os do pacote puro `@ativada/model-agents`; o banco os repete porque este pacote não depende dele.
export const MODEL_TEAM_KEYS = ['nina', 'lucas', 'olivia'] as const;
export const MODEL_TEAM_PROVIDERS = ['anthropic', 'google', 'openai'] as const;
export const MODEL_TEAM_PROMPT_VERSIONS = ['team-prompt-1'] as const;
export const MODEL_TEAM_TIMEFRAMES = ['15m'] as const;

export const MODEL_TEAM_REPORT_KIND = { SCHEDULED: 'scheduled', ON_DEMAND: 'on_demand' } as const;
export type ModelTeamReportKind =
  (typeof MODEL_TEAM_REPORT_KIND)[keyof typeof MODEL_TEAM_REPORT_KIND];

export const MODEL_TEAM_REPORT_STATUS = {
  PENDING: 'pending',
  DECIDED: 'decided',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;
export type ModelTeamReportStatus =
  (typeof MODEL_TEAM_REPORT_STATUS)[keyof typeof MODEL_TEAM_REPORT_STATUS];

export const MODEL_TEAM_REPORT_ACTION = { BUY: 'buy', SELL: 'sell', HOLD: 'hold' } as const;

export const MODEL_TEAM_CONFIDENCE_MAXIMUM = 100;
export const MODEL_TEAM_RAW_OUTPUT_MAX_LENGTH = 2_048;
export const MODEL_TEAM_FAILURE_CODE_MAX_LENGTH = 48;
export const MODEL_TEAM_MODEL_ID_MAX_LENGTH = 80;

// Reivindicação: uma linha com mais de 2 tentativas desiste (a vela de 15 min não espera para sempre).
export const MODEL_TEAM_CLAIM_MAXIMUM_BATCH = 20;
export const MODEL_TEAM_MAXIMUM_ATTEMPTS = 2;
export const MODEL_TEAM_ATTEMPTS_EXHAUSTED_CODE = 'ATTEMPTS_EXHAUSTED';

export const CANDLE_DURATION_15M_MILLISECONDS = 900_000;
export const MILLISECONDS_PER_MINUTE = 60_000;
export const MODEL_TEAM_RETENTION_DAYS = 365;
