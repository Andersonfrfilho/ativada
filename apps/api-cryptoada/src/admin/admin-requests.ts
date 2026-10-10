// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseAccountId, type AccountId, type AccountPageCursor } from '@cryptoada/database';
import { z } from '@cryptoada/environment';

import { parseWithSchema } from '../shared/http/read-validated-body.js';
import { RequestValidationError } from '../shared/http/request-validation.error.js';
import { decodeAccountCursor } from './account-cursor.js';
import {
  CURSOR_MAX_LENGTH,
  DEFAULT_ACCOUNT_PAGE_SIZE,
  EMAIL_MAX_LENGTH,
  MAX_ACCOUNT_PAGE_SIZE,
} from './admin.constant.js';
import { AccountNotFoundError } from './admin.error.js';

export const inviteUserSchema = z.strictObject({
  email: z
    .email()
    .max(EMAIL_MAX_LENGTH)
    .transform((email) => email.trim().toLowerCase()),
});

const listAccountsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(MAX_ACCOUNT_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});

export type ListAccountsQuery = {
  readonly after: AccountPageCursor | undefined;
  readonly limit: number;
};

export function readListAccountsQuery(request: Request): ListAccountsQuery {
  const query = parseWithSchema(
    Object.fromEntries(new URL(request.url).searchParams),
    listAccountsQuerySchema,
  );
  const after = query.cursor === undefined ? undefined : decodeAccountCursor(query.cursor);
  if (query.cursor !== undefined && after === undefined) {
    throw new RequestValidationError([{ field: 'cursor', reason: 'invalid_cursor' }]);
  }
  return { after, limit: query.limit ?? DEFAULT_ACCOUNT_PAGE_SIZE };
}

export function readAccountId(value: string | undefined): AccountId {
  const accountId = value === undefined ? undefined : parseAccountId(value);
  if (accountId === undefined) throw new AccountNotFoundError();
  return accountId;
}
