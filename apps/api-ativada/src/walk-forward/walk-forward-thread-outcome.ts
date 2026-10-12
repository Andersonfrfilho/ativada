// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PhaseMilliseconds } from './walk-forward.types.js';
import { WALK_FORWARD_ERROR_CODE, type WalkForwardRunErrorCode } from './walk-forward.constant.js';
import { WALK_FORWARD_MESSAGE_TYPE, type WalkForwardEvent } from './walk-forward-messages.js';

export const WALK_FORWARD_THREAD_STATUS = {
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  TERMINATED: 'terminated',
} as const;

export type WalkForwardThreadOutcome =
  | {
      readonly status: typeof WALK_FORWARD_THREAD_STATUS.COMPLETED;
      readonly runId: string;
      readonly windows: number;
      readonly combinations: number;
      readonly candles: number;
      readonly isOverfittingAlert: boolean;
      readonly phases: PhaseMilliseconds;
      // Da criação da thread até ela estar pronta para receber o pedido.
      readonly startMilliseconds: number;
    }
  | {
      readonly status: typeof WALK_FORWARD_THREAD_STATUS.CANCELLED;
      readonly runId: string;
      readonly completedWindows: number;
    }
  | {
      readonly status: typeof WALK_FORWARD_THREAD_STATUS.FAILED;
      readonly runId: string;
      readonly errorCode: WalkForwardRunErrorCode;
      readonly isRecorded: boolean;
    }
  // Encerramento gracioso da API: a execução fica como estava (`running` com checkpoint), recuperável.
  | { readonly status: typeof WALK_FORWARD_THREAD_STATUS.TERMINATED; readonly runId: string };

export type RecordFailure = (params: {
  readonly runId: string;
  readonly errorCode: WalkForwardRunErrorCode;
}) => Promise<boolean>;

export type ThreadSettings = {
  // A thread principal marca `failed` quando a thread morreu ou estourou o tempo: a thread não pode.
  readonly recordFailure: RecordFailure;
};

export type Settlement =
  | { readonly kind: 'event'; readonly event: WalkForwardEvent; readonly startMilliseconds: number }
  | { readonly kind: 'failure'; readonly errorCode: WalkForwardRunErrorCode }
  | { readonly kind: 'terminated' };

async function safeRecord(
  record: RecordFailure,
  params: { readonly runId: string; readonly errorCode: WalkForwardRunErrorCode },
): Promise<boolean> {
  try {
    return await record(params);
  } catch {
    return false;
  }
}

function toCompleted(
  event: Extract<WalkForwardEvent, { type: 'completed' }>,
  startMilliseconds: number,
): WalkForwardThreadOutcome {
  return {
    status: WALK_FORWARD_THREAD_STATUS.COMPLETED,
    runId: event.runId,
    windows: event.windows,
    combinations: event.combinations,
    candles: event.candles,
    isOverfittingAlert: event.isOverfittingAlert,
    phases: event.phases,
    startMilliseconds,
  };
}

export async function finalize(
  params: ThreadSettings,
  runId: string,
  settlement: Settlement,
): Promise<WalkForwardThreadOutcome> {
  if (settlement.kind === 'terminated') {
    return { status: WALK_FORWARD_THREAD_STATUS.TERMINATED, runId };
  }
  if (settlement.kind === 'failure') {
    const { errorCode } = settlement;
    const isRecorded = await safeRecord(params.recordFailure, { runId, errorCode });
    return { status: WALK_FORWARD_THREAD_STATUS.FAILED, runId, errorCode, isRecorded };
  }
  const { event } = settlement;
  if (event.type === WALK_FORWARD_MESSAGE_TYPE.COMPLETED) {
    return toCompleted(event, settlement.startMilliseconds);
  }
  if (event.type === WALK_FORWARD_MESSAGE_TYPE.CANCELLED) {
    return {
      status: WALK_FORWARD_THREAD_STATUS.CANCELLED,
      runId,
      completedWindows: event.completedWindows,
    };
  }
  if (event.type !== WALK_FORWARD_MESSAGE_TYPE.FAILED) {
    return finalize(params, runId, {
      kind: 'failure',
      errorCode: WALK_FORWARD_ERROR_CODE.WORKER_CRASHED,
    });
  }
  const isRecorded =
    event.isRecorded ||
    (await safeRecord(params.recordFailure, { runId, errorCode: event.errorCode }));
  return {
    status: WALK_FORWARD_THREAD_STATUS.FAILED,
    runId,
    errorCode: event.errorCode,
    isRecorded,
  };
}
