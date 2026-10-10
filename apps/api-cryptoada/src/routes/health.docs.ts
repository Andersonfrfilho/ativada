// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

const TAG = 'Saúde';

export const HEALTH_DOCUMENTATION = {
  health: {
    summary: 'A API está de pé (sem tocar o banco).',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'A API responde.',
        schema: z.strictObject({ status: z.literal('ok') }),
      },
    ],
    errors: [],
  },
  adminHealth: {
    summary: 'Saúde das dependências, só números agregados (administrador).',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Estado do sistema.',
        schema: z.strictObject({
          status: z.enum(['ok', 'degraded']),
          checks: z.strictObject({ database: z.enum(['up', 'down']) }),
        }),
      },
    ],
    errors: [],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
