// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import {
  FEATURE_ERROR_CODE,
  TELEGRAM_ERROR_CODE,
  VALIDATION_ERROR_CODE,
} from '../shared/errors/error-code.constant.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

const TAG = 'Telegram';

export const TELEGRAM_DOCUMENTATION = {
  issueLinkCode: {
    summary: 'Gera o código de uso único (10 minutos) para vincular o chat do Telegram.',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.CREATED,
        description: 'O código a enviar ao bot com /start.',
        schema: z.strictObject({ code: z.string(), expiresInSeconds: z.number().int().positive() }),
      },
    ],
    errors: [
      { status: HTTP_STATUS.SERVICE_UNAVAILABLE, code: FEATURE_ERROR_CODE.FEATURE_DISABLED },
    ],
  },
  unlink: {
    summary: 'Desvincula o chat do Telegram.',
    tag: TAG,
    successes: [{ status: HTTP_STATUS.NO_CONTENT, description: 'Chat desvinculado.' }],
    errors: [],
  },
  webhook: {
    summary: 'Webhook do bot (público; protegido pelo segredo `X-Telegram-Bot-Api-Secret-Token`).',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Update recebido.',
        schema: z.strictObject({ received: z.literal(true) }),
      },
    ],
    errors: [
      { status: HTTP_STATUS.UNAUTHORIZED, code: TELEGRAM_ERROR_CODE.TELEGRAM_WEBHOOK_REJECTED },
      { status: HTTP_STATUS.BAD_REQUEST, code: VALIDATION_ERROR_CODE.REQUEST_VALIDATION_FAILED },
    ],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
