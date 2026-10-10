// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND } from '@cryptoada/database';
import { z } from '@cryptoada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { LISTENER_STATE } from '../stream/listener-health.js';
import { HTTP_STATUS } from '../shared/http/http.constant.js';

const TAG = 'Saúde';

const KIND_COUNTS_SCHEMA = z.strictObject({
  queued: z.number().int().min(0),
  running: z.number().int().min(0),
});

// Só contagens: a fila inteira por estado e por tipo, sem usuário, id de execução nem dono.
const RUN_QUEUE_SUMMARY_SCHEMA = z.strictObject({
  queued: z.number().int().min(0),
  running: z.number().int().min(0),
  byKind: z.strictObject({
    [RUN_KIND.BACKTEST]: KIND_COUNTS_SCHEMA,
    [RUN_KIND.WALK_FORWARD]: KIND_COUNTS_SCHEMA,
    [RUN_KIND.LIVE_PAPER]: KIND_COUNTS_SCHEMA,
  }),
});

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
    summary:
      'Saúde das dependências, estado do escutador de tempo real (com o motivo de uma falha fatal, sem segredo) e contagens agregadas da fila de execuções, só números (administrador).',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Estado do sistema.',
        schema: z.strictObject({
          status: z.enum(['ok', 'degraded']),
          checks: z.strictObject({ database: z.enum(['up', 'down']) }),
          listener: z.strictObject({
            state: z.enum([LISTENER_STATE.UP, LISTENER_STATE.RECONNECTING, LISTENER_STATE.FAILED]),
            reason: z.string().nullable(),
          }),
          runs: RUN_QUEUE_SUMMARY_SCHEMA.nullable(),
        }),
      },
    ],
    errors: [],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
