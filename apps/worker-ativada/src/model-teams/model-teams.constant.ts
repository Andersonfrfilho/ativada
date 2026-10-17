// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com';

export const ANTHROPIC_VERSION_HEADER_VALUE = '2023-06-01';
export const ANTHROPIC_TOOL_NAME = 'report_team';
export const OPENAI_SCHEMA_NAME = 'team_report';

export const MAXIMUM_API_KEY_LENGTH = 512;
export const MODEL_ID_PATTERN = /^[a-z0-9.-]{3,80}$/u;
export const PRICE_PATTERN = /^[0-9]+(\.[0-9]{1,8})?$/u;
export const POSITIVE_DECIMAL_PATTERN = /^(?!0+(\.0+)?$)[0-9]+(\.[0-9]+)?$/u;

export const REASONING_LEVEL = { LOW: 'low', MEDIUM: 'medium', HIGH: 'high' } as const;
export type ReasoningLevel = (typeof REASONING_LEVEL)[keyof typeof REASONING_LEVEL];

export const MODEL_TEAM_LIMITS = {
  timeoutSeconds: { minimum: 5, maximum: 90, fallback: 30 },
  maxOutputTokens: { minimum: 200, maximum: 2_000, fallback: 900 },
  concurrency: { minimum: 1, maximum: 6, fallback: 3 },
  pollSeconds: { minimum: 1, maximum: 30, fallback: 2 },
  deadlineSeconds: { minimum: 5, maximum: 120, fallback: 45 },
  thinkingTokens: { minimum: 0, maximum: 32_000, fallback: 2_000 },
} as const;

// O ritmo padrão é de 60 min (autorização do usuário); 15 min é a alternativa.
export const MODEL_TEAM_CADENCE_MINUTES = ['15', '60'] as const;
export const DEFAULT_CADENCE_MINUTES = '60';
export const DEFAULT_ENTRY_TOLERANCE_PERCENT = '1.5';
export const DEFAULT_MIN_STOP_PERCENT = '0.2';

export const MODEL_TEAM_LEASE_MARGIN_MILLISECONDS = 30_000;
export const MODEL_TEAM_STALE_CANDLES = 2;
export const MODEL_TEAM_CANDLE_MILLISECONDS = 900_000;

// Códigos curtos gravados em `failure_code`: nunca texto de erro, URL, chave nem resposta.
export const MODEL_TEAM_FAILURE = {
  STALE: 'STALE',
  NO_KEY: 'NO_KEY',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED',
  NO_INPUT: 'NO_INPUT',
  INVALID_OUTPUT: 'INVALID_OUTPUT',
  INVALID_LEVELS: 'INVALID_LEVELS',
  REFUSED: 'REFUSED',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAVAILABLE: 'UNAVAILABLE',
  KEY_REJECTED: 'KEY_REJECTED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  DISPATCH_ERROR: 'DISPATCH_ERROR',
} as const;

export const MODEL_TEAM_LOG = {
  DISPATCH_FAILED: 'model team dispatch failed',
  REPORT_DECIDED: 'model team report decided',
  REPORT_FAILED: 'model team report failed',
  REPORT_SKIPPED: 'model team report skipped',
  REPORT_ERRORED: 'model team report errored',
  ENQUEUE_FAILED: 'model team enqueue failed',
  STATUS_BEAT_FAILED: 'model team status failed',
} as const;
