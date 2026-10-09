// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@crypto/environment';

import { AUDIT_ACTION, type AuditAction } from './admin.constant.js';

export const auditPayloadSchemas: Readonly<
  Record<AuditAction, z.ZodType<Record<string, unknown>>>
> = {
  [AUDIT_ACTION.INVITATION_SENT]: z.strictObject({ isResend: z.boolean() }),
  [AUDIT_ACTION.ACCOUNT_BLOCKED]: z.strictObject({ isIdentityProviderSynced: z.boolean() }),
  [AUDIT_ACTION.ACCOUNT_UNBLOCKED]: z.strictObject({}),
};
