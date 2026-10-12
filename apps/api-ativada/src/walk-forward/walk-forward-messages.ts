// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';

const PERCENT_MAXIMUM = 100;
const ERROR_CODES = Object.values(WALK_FORWARD_ERROR_CODE);

export const WALK_FORWARD_MESSAGE_TYPE = {
  RUN: 'run',
  READY: 'ready',
  PROGRESS: 'progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
} as const;

const runIdSchema = z.uuid();
const countSchema = z.int().min(0);
const millisecondsSchema = z.number().min(0);
// Entrada da thread: só o identificador. O PEDIDO (a grade e as janelas) mora na linha da execução (`runs.request`) e a
// thread o lê de lá; nada de pedido, dono, token nem conexão atravessa a fronteira.
export const WALK_FORWARD_REQUEST_MESSAGE_SCHEMA = z.strictObject({
  type: z.literal(WALK_FORWARD_MESSAGE_TYPE.RUN),
  runId: runIdSchema,
});

const phasesSchema = z.strictObject({
  load: millisecondsSchema,
  search: millisecondsSchema,
  test: millisecondsSchema,
  report: millisecondsSchema,
});

// Eventos da thread para a API: progresso e resultado em números. Nunca o resultado em si, o estado do motor,
// mensagem de erro de driver nem dado de usuário.
export const WALK_FORWARD_EVENT_SCHEMA = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal(WALK_FORWARD_MESSAGE_TYPE.READY) }),
  z.strictObject({
    type: z.literal(WALK_FORWARD_MESSAGE_TYPE.PROGRESS),
    runId: runIdSchema,
    progress: z.int().min(0).max(PERCENT_MAXIMUM),
  }),
  z.strictObject({
    type: z.literal(WALK_FORWARD_MESSAGE_TYPE.COMPLETED),
    runId: runIdSchema,
    windows: countSchema,
    combinations: countSchema,
    candles: countSchema,
    isOverfittingAlert: z.boolean(),
    phases: phasesSchema,
  }),
  z.strictObject({
    type: z.literal(WALK_FORWARD_MESSAGE_TYPE.CANCELLED),
    runId: runIdSchema,
    completedWindows: countSchema,
  }),
  z.strictObject({
    type: z.literal(WALK_FORWARD_MESSAGE_TYPE.FAILED),
    runId: runIdSchema.optional(),
    errorCode: z.enum(ERROR_CODES),
    isRecorded: z.boolean(),
  }),
]);

export type WalkForwardThreadRequest = z.infer<typeof WALK_FORWARD_REQUEST_MESSAGE_SCHEMA>;
export type WalkForwardEvent = z.infer<typeof WALK_FORWARD_EVENT_SCHEMA>;
