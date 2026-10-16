// Copyright (c) 2026 Ada Technology. All rights reserved.

// Os valores espelham os do pacote puro `@ativada/risk-analyst`; o banco os repete porque este pacote não depende dele.
export const ANALYST_DECISION_VERSION = ['analyst-1'] as const;

export const ANALYST_DECISION_MODE = { SHADOW: 'shadow', GOVERN: 'govern' } as const;

export const ANALYST_DECISION_STATUS = { DECIDED: 'decided', FAILED: 'failed' } as const;

export const ANALYST_DECISION_POSTURE = {
  PAUSE: 'pause',
  CAUTION: 'caution',
  NORMAL: 'normal',
  CONFIDENT: 'confident',
} as const;

export const ANALYST_DECISION_ENTRY_GATE = { OPEN: 'open', CLOSED: 'closed' } as const;

export const ANALYST_DECISION_CADENCE_MINUTES = [15, 60, 240] as const;

// Texto decimal exato, como o `numeric` do banco devolve (0, 0.25, 0.5, 1).
export const ANALYST_DECISION_RISK_SCALE = ['0', '0.25', '0.5', '1'] as const;

export const ANALYST_DECISION_PAGE_MAXIMUM_SIZE = 100;
