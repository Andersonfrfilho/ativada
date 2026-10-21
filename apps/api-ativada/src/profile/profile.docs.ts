// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { isoDateTimeSchema, resourceIdSchema } from '../openapi/schema-primitives.js';
import { PROFILE_ERROR_CODE, VALIDATION_ERROR_CODE } from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';
import { updateProfileSchema } from './update-profile-request.js';

const TAG = 'Perfil';
const NOT_FOUND = {
  status: HTTP_STATUS.NOT_FOUND,
  code: PROFILE_ERROR_CODE.PROFILE_NOT_FOUND,
} as const;

export const PROFILE_VIEW_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  displayName: z.string().nullable(),
  displayCurrency: z.enum(['BRL', 'USD']),
  timezone: z.string(),
  alertTelegramEnabled: z.boolean(),
  telegramLinked: z.boolean(),
  limits: z.strictObject({ maxActiveLivePaperRuns: z.number().int().min(1) }),
  createdAt: isoDateTimeSchema,
});

export const PROFILE_DOCUMENTATION = {
  get: {
    summary: 'Perfil e preferências do usuário autenticado.',
    tag: TAG,
    successes: [{ status: HTTP_STATUS.OK, description: 'O perfil.', schema: PROFILE_VIEW_SCHEMA }],
    errors: [NOT_FOUND],
  },
  update: {
    summary: 'Altera as preferências (nome, moeda de exibição, fuso, alerta no Telegram).',
    tag: TAG,
    body: updateProfileSchema,
    successes: [
      { status: HTTP_STATUS.OK, description: 'O perfil já alterado.', schema: PROFILE_VIEW_SCHEMA },
    ],
    errors: [
      { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
      NOT_FOUND,
    ],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
