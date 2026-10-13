// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND } from '@ativada/database';
import { z } from '@ativada/environment';

import type { RouteDocumentation } from '../openapi/route-documentation.types.js';
import { WORKER_STATE } from '../health/health-view.js';
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

const DATABASE_HEALTH_SCHEMA = z.strictObject({
  state: z.enum(['up', 'down']),
  consecutiveFailures: z.number().int().min(0),
  downSince: z.number().int().nullable(),
  lastFailureCode: z.string().nullable(),
  lastFailureAt: z.number().int().nullable(),
});

const WORKER_HEALTH_SCHEMA = z.strictObject({
  lastHeartbeatAt: z.number().int().nullable(),
  ageSeconds: z.number().int().min(0).nullable(),
  state: z.enum([WORKER_STATE.ALIVE, WORKER_STATE.STALE, WORKER_STATE.UNKNOWN]),
});

export const HEALTH_DOCUMENTATION = {
  health: {
    summary: 'A API está de pé e o banco responde a um SELECT 1 em até 1 s.',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'A API e o banco respondem.',
        schema: z.strictObject({ status: z.literal('ok') }),
      },
      {
        status: HTTP_STATUS.SERVICE_UNAVAILABLE,
        description: 'O banco não respondeu a tempo. Sem nenhum detalhe: o motivo fica no admin.',
        schema: z.strictObject({ status: z.literal('degraded') }),
      },
    ],
    errors: [],
  },
  adminHealth: {
    summary:
      'Saúde das dependências, do banco (estado e último código de falha, nunca a mensagem), do batimento do worker, do escutador de tempo real (com o motivo de uma falha fatal, sem segredo) e contagens agregadas da fila de execuções, só números (administrador).',
    tag: TAG,
    successes: [
      {
        status: HTTP_STATUS.OK,
        description: 'Estado do sistema.',
        schema: z.strictObject({
          status: z.enum(['ok', 'degraded']),
          checks: z.strictObject({ database: z.enum(['up', 'down']) }),
          database: DATABASE_HEALTH_SCHEMA,
          listener: z.strictObject({
            state: z.enum([LISTENER_STATE.UP, LISTENER_STATE.RECONNECTING, LISTENER_STATE.FAILED]),
            reason: z.string().nullable(),
          }),
          runs: RUN_QUEUE_SUMMARY_SCHEMA.nullable(),
          worker: WORKER_HEALTH_SCHEMA,
        }),
      },
    ],
    errors: [],
  },
} as const satisfies Readonly<Record<string, RouteDocumentation>>;
