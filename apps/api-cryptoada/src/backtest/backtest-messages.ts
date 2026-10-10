// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { BACKTEST_ERROR_CODE } from './backtest.constant.js';

const PERCENT_MAXIMUM = 100;
const ERROR_CODES = Object.values(BACKTEST_ERROR_CODE);

export const BACKTEST_MESSAGE_TYPE = {
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

// Entrada da thread: só o identificador. Nada de configuração, parâmetro nem dado de usuário atravessa a fronteira.
export const BACKTEST_REQUEST_SCHEMA = z.strictObject({
  type: z.literal(BACKTEST_MESSAGE_TYPE.RUN),
  runId: runIdSchema,
});

const phasesSchema = z.strictObject({
  load: millisecondsSchema,
  engine: millisecondsSchema,
  write: millisecondsSchema,
  metrics: millisecondsSchema,
});

// Eventos da thread para a API: progresso e resultado em números. Nunca o estado do motor, o resultado em si,
// mensagem de erro de driver nem dado de usuário.
export const BACKTEST_EVENT_SCHEMA = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal(BACKTEST_MESSAGE_TYPE.READY) }),
  z.strictObject({
    type: z.literal(BACKTEST_MESSAGE_TYPE.PROGRESS),
    runId: runIdSchema,
    progress: z.int().min(0).max(PERCENT_MAXIMUM),
  }),
  z.strictObject({
    type: z.literal(BACKTEST_MESSAGE_TYPE.COMPLETED),
    runId: runIdSchema,
    processedCandles: countSchema,
    batches: countSchema,
    gapCandles: countSchema,
    phases: phasesSchema,
  }),
  z.strictObject({
    type: z.literal(BACKTEST_MESSAGE_TYPE.CANCELLED),
    runId: runIdSchema,
    processedCandles: countSchema,
    batches: countSchema,
  }),
  z.strictObject({
    type: z.literal(BACKTEST_MESSAGE_TYPE.FAILED),
    runId: runIdSchema.optional(),
    errorCode: z.enum(ERROR_CODES),
    isRecorded: z.boolean(),
  }),
]);

export type BacktestRequest = z.infer<typeof BACKTEST_REQUEST_SCHEMA>;
export type BacktestEvent = z.infer<typeof BACKTEST_EVENT_SCHEMA>;
