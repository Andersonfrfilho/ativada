// Copyright (c) 2026 Ada Technology. All rights reserved.
export const ME_EXPORT_PATH = '/v1/me/export';
export const EXPORT_FILE_NAME_PREFIX = 'crypto-paper-trader-export';
export const ISO_DATE_LENGTH = 10;

export const ACCOUNT_AUDIT_ACTION = {
  DELETION_REQUESTED: 'account.deletion_requested',
} as const;

export const DELETION_STATUS = {
  STARTED: 'deletion_started',
} as const;
