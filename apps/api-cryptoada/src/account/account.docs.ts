// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  ADMIN_ERROR_CODE,
  AUTHENTICATION_ERROR_CODE,
  PROFILE_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { DELETION_STATUS } from './account.constant.js';

const TAG = 'Conta (LGPD)';
const NOT_FOUND = {
  status: HTTP_STATUS.NOT_FOUND,
  code: PROFILE_ERROR_CODE.PROFILE_NOT_FOUND,
} as const;
const IDENTITY_UNAVAILABLE = {
  status: HTTP_STATUS.SERVICE_UNAVAILABLE,
  code: ADMIN_ERROR_CODE.IDENTITY_PROVIDER_UNAVAILABLE,
} as const;

export const ACCOUNT_DOCUMENTATION = {
  export: {
    summary:
      'Exporta todos os dados do próprio usuário (LGPD) em NDJSON, em fluxo por páginas, 1 exportação por hora. Linhas: `header` (data e perfil), `row` (uma por registro de cada tabela), `audit` (auditoria como ator e como alvo) e `end` (contagens: arquivo sem ela está incompleto).',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'O arquivo NDJSON (`Content-Disposition: attachment`).',
        contentType: 'application/x-ndjson; charset=utf-8',
        schema: z.string(),
      },
    ],
    errors: [NOT_FOUND, IDENTITY_UNAVAILABLE],
  },
  delete: {
    summary: 'Pede a exclusão da própria conta (exige autenticação recente).',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.ACCEPTED,
        description: 'Exclusão iniciada; o restante acontece no cron, depois da carência.',
        schema: z.strictObject({ status: z.literal(DELETION_STATUS.STARTED) }),
      },
    ],
    errors: [
      { status: HTTP_STATUS.FORBIDDEN, code: AUTHENTICATION_ERROR_CODE.REAUTH_REQUIRED },
      NOT_FOUND,
      IDENTITY_UNAVAILABLE,
    ],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
