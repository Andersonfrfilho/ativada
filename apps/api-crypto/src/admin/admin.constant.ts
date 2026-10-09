// Copyright (c) 2026 Ada Technology. All rights reserved.
export const INVITATIONS_PATH = '/v1/admin/invitations';
export const ACCOUNTS_PATH = '/v1/admin/accounts';
export const ACCOUNT_BLOCK_PATH = '/v1/admin/accounts/:accountId/block';
export const ACCOUNT_UNBLOCK_PATH = '/v1/admin/accounts/:accountId/unblock';
export const ACCOUNT_ID_PARAM = 'accountId';

export const DEFAULT_ACCOUNT_PAGE_SIZE = 50;
export const MAX_ACCOUNT_PAGE_SIZE = 100;
export const EMAIL_MAX_LENGTH = 254;
export const CURSOR_MAX_LENGTH = 200;

export const AUDIT_ACTION = {
  INVITATION_SENT: 'invitation.sent',
  ACCOUNT_BLOCKED: 'account.blocked',
  ACCOUNT_UNBLOCKED: 'account.unblocked',
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export const AUDIT_TARGET_KIND = {
  ACCOUNT: 'account',
  INVITATION: 'invitation',
} as const;
