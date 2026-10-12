// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { SESSION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { exchangeCodeBodySchema } from './read-exchange-code-request.js';

const TAG = 'Sessão (token handler)';
const TOKENS = z.strictObject({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
});
const CSRF = { status: HTTP_STATUS.FORBIDDEN, code: SESSION_ERROR_CODE.CSRF_REJECTED } as const;
const UNAVAILABLE = {
  status: HTTP_STATUS.SERVICE_UNAVAILABLE,
  code: SESSION_ERROR_CODE.SESSION_UNAVAILABLE,
} as const;

export const SESSION_DOCUMENTATION = {
  create: {
    summary: 'Troca o código do login (PKCE) pelo access token; o refresh vai no cookie `__Host-`.',
    tag: TAG,
    body: exchangeCodeBodySchema,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Access token e validade em segundos.',
        schema: TOKENS,
      },
    ],
    errors: [
      CSRF,
      { status: HTTP_STATUS.BAD_REQUEST, code: SESSION_ERROR_CODE.INVALID_SESSION_REQUEST },
      { status: HTTP_STATUS.BAD_REQUEST, code: SESSION_ERROR_CODE.REDIRECT_URI_NOT_ALLOWED },
      { status: HTTP_STATUS.BAD_REQUEST, code: SESSION_ERROR_CODE.AUTHORIZATION_CODE_REJECTED },
      UNAVAILABLE,
    ],
  },
  refresh: {
    summary: 'Renova o access token pelo cookie de refresh, com rotação.',
    tag: TAG,
    successes: [{ status: HTTP_STATUS.OK, description: 'Novo access token.', schema: TOKENS }],
    errors: [
      CSRF,
      { status: HTTP_STATUS.UNAUTHORIZED, code: SESSION_ERROR_CODE.SESSION_ENDED },
      UNAVAILABLE,
    ],
  },
  end: {
    summary: 'Encerra a sessão (logout no Keycloak) e apaga o cookie.',
    tag: TAG,
    successes: [{ status: HTTP_STATUS.NO_CONTENT, description: 'Sessão encerrada.' }],
    errors: [CSRF, UNAVAILABLE],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
