// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ModelTeamKey } from './model-team-catalog.constant.js';
import type { TeamReport } from './team-report.schema.js';

export const MODEL_CALL_STATUS = {
  OK: 'ok',
  INVALID_OUTPUT: 'invalid_output',
  REFUSED: 'refused',
  TIMEOUT: 'timeout',
  RATE_LIMITED: 'rate_limited',
  UNAVAILABLE: 'unavailable',
  KEY_REJECTED: 'key_rejected',
  MODEL_NOT_FOUND: 'model_not_found',
  BAD_REQUEST: 'bad_request',
} as const;
export type ModelCallStatus = (typeof MODEL_CALL_STATUS)[keyof typeof MODEL_CALL_STATUS];

export type ModelTokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly thinkingTokens: number;
};

export type ModelCallMeasure = Partial<ModelTokenUsage> & { readonly latencyMilliseconds: number };

// RF01: só código, NUNCA o texto do erro (o erro do `fetch` cita a URL e os cabeçalhos).
export type ModelCallResult =
  | {
      readonly status: typeof MODEL_CALL_STATUS.OK;
      readonly report: TeamReport;
      readonly usage: ModelTokenUsage;
      readonly latencyMilliseconds: number;
    }
  | {
      readonly status: typeof MODEL_CALL_STATUS.RATE_LIMITED;
      readonly retryAfterMilliseconds: number;
    }
  | {
      readonly status: Exclude<
        ModelCallStatus,
        typeof MODEL_CALL_STATUS.OK | typeof MODEL_CALL_STATUS.RATE_LIMITED
      >;
      readonly measure?: ModelCallMeasure;
    };

export type ModelCallLimits = {
  readonly timeoutMilliseconds: number;
  readonly maxOutputTokens: number;
};

export type RequestTeamReportParams = {
  readonly team: ModelTeamKey;
  readonly prompt: string;
  readonly limits: ModelCallLimits;
  readonly signal: AbortSignal;
};
