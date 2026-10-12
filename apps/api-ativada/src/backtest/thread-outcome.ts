// Copyright (c) 2026 Ada Technology. All rights reserved.
import { BACKTEST_ERROR_CODE, type BacktestErrorCode } from './backtest.constant.js';
import type { PhaseMilliseconds } from './backtest.types.js';
import { BACKTEST_MESSAGE_TYPE, type BacktestEvent } from './backtest-messages.js';

export const THREAD_OUTCOME_STATUS = {
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  TERMINATED: 'terminated',
} as const;

export type BacktestThreadOutcome =
  | {
      readonly status: typeof THREAD_OUTCOME_STATUS.COMPLETED;
      readonly runId: string;
      readonly processedCandles: number;
      readonly batches: number;
      readonly gapCandles: number;
      readonly phases: PhaseMilliseconds;
      // Da criação da thread até ela estar pronta para receber o pedido.
      readonly startMilliseconds: number;
    }
  | { readonly status: typeof THREAD_OUTCOME_STATUS.CANCELLED; readonly runId: string }
  | {
      readonly status: typeof THREAD_OUTCOME_STATUS.FAILED;
      readonly runId: string;
      readonly errorCode: BacktestErrorCode;
      readonly isRecorded: boolean;
    }
  // Encerramento gracioso da API: a execução fica como estava (`running` com checkpoint), recuperável.
  | { readonly status: typeof THREAD_OUTCOME_STATUS.TERMINATED; readonly runId: string };

export type RecordFailure = (params: {
  readonly runId: string;
  readonly errorCode: BacktestErrorCode;
}) => Promise<boolean>;

export type ThreadSettings = {
  // A thread principal marca `failed` quando a thread morreu ou estourou o tempo: a thread não pode.
  readonly recordFailure: RecordFailure;
};

export type Settlement =
  | { readonly kind: 'event'; readonly event: BacktestEvent; readonly startMilliseconds: number }
  | { readonly kind: 'failure'; readonly errorCode: BacktestErrorCode }
  | { readonly kind: 'terminated' };

async function safeRecord(
  record: RecordFailure,
  params: { readonly runId: string; readonly errorCode: BacktestErrorCode },
): Promise<boolean> {
  try {
    return await record(params);
  } catch {
    return false;
  }
}

function toCompleted(
  event: Extract<BacktestEvent, { type: 'completed' }>,
  startMilliseconds: number,
): BacktestThreadOutcome {
  return {
    status: THREAD_OUTCOME_STATUS.COMPLETED,
    runId: event.runId,
    processedCandles: event.processedCandles,
    batches: event.batches,
    gapCandles: event.gapCandles,
    phases: event.phases,
    startMilliseconds,
  };
}

export async function finalize(
  params: ThreadSettings,
  runId: string,
  settlement: Settlement,
): Promise<BacktestThreadOutcome> {
  if (settlement.kind === 'terminated') {
    return { status: THREAD_OUTCOME_STATUS.TERMINATED, runId };
  }
  if (settlement.kind === 'failure') {
    const { errorCode } = settlement;
    const isRecorded = await safeRecord(params.recordFailure, { runId, errorCode });
    return { status: THREAD_OUTCOME_STATUS.FAILED, runId, errorCode, isRecorded };
  }
  const { event } = settlement;
  if (event.type === BACKTEST_MESSAGE_TYPE.COMPLETED) {
    return toCompleted(event, settlement.startMilliseconds);
  }
  if (event.type === BACKTEST_MESSAGE_TYPE.CANCELLED) {
    return { status: THREAD_OUTCOME_STATUS.CANCELLED, runId };
  }
  if (event.type !== BACKTEST_MESSAGE_TYPE.FAILED) {
    return finalize(params, runId, {
      kind: 'failure',
      errorCode: BACKTEST_ERROR_CODE.WORKER_CRASHED,
    });
  }
  const isRecorded =
    event.isRecorded ||
    (await safeRecord(params.recordFailure, { runId, errorCode: event.errorCode }));
  return {
    status: THREAD_OUTCOME_STATUS.FAILED,
    runId,
    errorCode: event.errorCode,
    isRecorded,
  };
}
