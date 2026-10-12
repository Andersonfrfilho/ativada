// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { isoDateTimeSchema, pathIdSchema, resourceIdSchema } from '../openapi/schema-primitives.js';
import { ADMIN_ERROR_CODE, VALIDATION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { ACCOUNT_ID_PARAM } from './admin.constant.js';
import { inviteUserSchema, listAccountsQuerySchema } from './admin-requests.js';

const TAG = 'Administração';
const VALIDATION = {
  status: HTTP_STATUS.BAD_REQUEST,
  code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED,
} as const;
const IDENTITY_UNAVAILABLE = {
  status: HTTP_STATUS.SERVICE_UNAVAILABLE,
  code: ADMIN_ERROR_CODE.IDENTITY_PROVIDER_UNAVAILABLE,
} as const;
const NOT_FOUND = {
  status: HTTP_STATUS.NOT_FOUND,
  code: ADMIN_ERROR_CODE.ACCOUNT_NOT_FOUND,
} as const;

const ACCOUNT_VIEW_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  createdAt: isoDateTimeSchema,
  blockedAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  email: z.string().nullable(),
});

const ACCOUNT_STATE_SCHEMA = z.strictObject({
  accountId: resourceIdSchema,
  isBlocked: z.boolean(),
  isIdentityProviderSynced: z.boolean(),
});

function accountState(
  summary: string,
  extraErrors: RouteDocumentation['errors'],
): RouteDocumentation {
  return {
    summary,
    tag: TAG,
    params: pathIdSchema(ACCOUNT_ID_PARAM),
    successes: [
      { status: HTTP_STATUS.OK, description: 'Estado da conta.', schema: ACCOUNT_STATE_SCHEMA },
      {
        status: HTTP_STATUS.ACCEPTED,
        description: 'Gravado, mas o provedor de identidade ainda precisa sincronizar.',
        schema: ACCOUNT_STATE_SCHEMA,
      },
    ],
    errors: [NOT_FOUND, IDENTITY_UNAVAILABLE, ...extraErrors],
  };
}

export const ADMIN_DOCUMENTATION = {
  invite: {
    summary: 'Convida um usuário por e-mail (cadastro por convite).',
    tag: TAG,
    body: inviteUserSchema,
    successes: [
      {
        status: HTTP_STATUS.CREATED,
        description: 'Convite enviado.',
        schema: z.strictObject({ isResend: z.boolean() }),
      },
    ],
    errors: [
      VALIDATION,
      { status: HTTP_STATUS.CONFLICT, code: ADMIN_ERROR_CODE.ACCOUNT_ALREADY_ACTIVE },
      IDENTITY_UNAVAILABLE,
    ],
  },
  listAccounts: {
    summary: 'Contas com dados mínimos (e-mail do Keycloak, estado e datas), por cursor.',
    tag: TAG,
    query: listAccountsQuerySchema,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Uma página de contas.',
        schema: z.array(ACCOUNT_VIEW_SCHEMA),
        isList: true,
      },
    ],
    errors: [VALIDATION],
  },
  block: accountState('Bloqueia uma conta (nunca a própria nem a de outro administrador).', [
    { status: HTTP_STATUS.CONFLICT, code: ADMIN_ERROR_CODE.CANNOT_BLOCK_SELF },
    { status: HTTP_STATUS.CONFLICT, code: ADMIN_ERROR_CODE.CANNOT_BLOCK_ADMIN },
  ]),
  unblock: accountState('Desbloqueia uma conta.', []),
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
