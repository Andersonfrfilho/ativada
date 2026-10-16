// Copyright (c) 2026 Ada Technology. All rights reserved.

// O vocabulário da linha gravada (`analyst_decisions.status` e `.mode`); a regra pura grava os mesmos valores.
export const ANALYST_DECISION_STATUS = { DECIDED: 'decided', FAILED: 'failed' } as const;
export const ANALYST_MODE = { SHADOW: 'shadow', GOVERN: 'govern' } as const;
export type AnalystMode = (typeof ANALYST_MODE)[keyof typeof ANALYST_MODE];

// Por que `current` não traz uma decisão, na ordem de precedência da A20.
export const ANALYST_UNAVAILABLE_REASON = {
  NOT_RUNNING: 'not_running',
  STALLED: 'stalled',
  WAITING_FOR_DATA: 'waiting_for_data',
  NO_CANDLE: 'no_candle',
  WARMING_UP: 'warming_up',
  FAILED: 'failed',
} as const;
export type AnalystUnavailableReason =
  (typeof ANALYST_UNAVAILABLE_REASON)[keyof typeof ANALYST_UNAVAILABLE_REASON];
