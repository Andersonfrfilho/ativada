// Copyright (c) 2026 Ada Technology. All rights reserved.
const MILLISECONDS_PER_HOUR = 3_600_000;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

// ADR 0001 §d e §h: a linha de users só sai 24 h depois de deleted_at.
export const ACCOUNT_REMOVAL_GRACE_PERIOD_MILLISECONDS = 24 * MILLISECONDS_PER_HOUR;
// ADR 0001 §i: o IP da trilha de auditoria vive 90 dias.
export const AUDIT_IP_RETENTION_MILLISECONDS = 90 * MILLISECONDS_PER_DAY;
// ADR 0001 §i: a linha de audit_events vive 2 anos (730 dias) e então é apagada.
export const AUDIT_EVENT_RETENTION_MILLISECONDS = 730 * MILLISECONDS_PER_DAY;
export const PENDING_ACCOUNTS_BATCH_LIMIT = 100;
export const BLOCKED_ACCOUNTS_BATCH_LIMIT = 100;
export const ACCOUNT_PARALLELISM = 10;

export const EXIT_CODE = {
  SUCCESS: 0,
  FAILURE: 1,
} as const;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];

export const NO_ERROR_CODE = 'none';

export const PURGE_STEP = {
  IDENTITY_DELETION: 'identity_deletion',
  DATA_PURGE: 'data_purge',
  ROW_REMOVAL: 'row_removal',
} as const;

export const TASK_NAME = {
  PURGE_DELETED_ACCOUNTS: 'purge-deleted-accounts',
  RECONCILE_BLOCKED_ACCOUNTS: 'reconcile-blocked-accounts',
  EXPIRE_AUDIT_EVENTS: 'expire-audit-events',
  BACKFILL_CANDLES: 'backfill-candles',
  BACKFILL_DISPLAY_CANDLES: 'backfill-display-candles',
  PURGE_DISPLAY_CANDLES: 'purge-display-candles',
  SYNC_FEAR_GREED: 'sync-fear-greed',
  EXPIRE_MODEL_TEAM_REPORTS: 'expire-model-team-reports',
} as const;
