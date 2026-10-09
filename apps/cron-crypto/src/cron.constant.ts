// Copyright (c) 2026 Ada Technology. All rights reserved.
const MILLISECONDS_PER_HOUR = 3_600_000;
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR;

// ADR 0001 §d e §h: a linha de users só sai 24 h depois de deleted_at.
export const ACCOUNT_REMOVAL_GRACE_PERIOD_MILLISECONDS = 24 * MILLISECONDS_PER_HOUR;
// ADR 0001 §i: o IP da trilha de auditoria vive 90 dias.
export const AUDIT_IP_RETENTION_MILLISECONDS = 90 * MILLISECONDS_PER_DAY;
export const PENDING_ACCOUNTS_BATCH_LIMIT = 100;
export const ACCOUNT_PARALLELISM = 10;

export const EXIT_CODE = {
  SUCCESS: 0,
  FAILURE: 1,
} as const;

export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];

export const PURGE_STEP = {
  IDENTITY_DELETION: 'identity_deletion',
  DATA_PURGE: 'data_purge',
  ROW_REMOVAL: 'row_removal',
} as const;
