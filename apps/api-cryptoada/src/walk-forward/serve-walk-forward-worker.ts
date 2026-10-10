// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

import { runWalkForward } from './run-walk-forward.js';
import { WALK_FORWARD_ERROR_CODE, WALK_FORWARD_OUTCOME_STATUS } from './walk-forward.constant.js';
import type { WalkForwardOutcome } from './walk-forward.types.js';
import type { WalkForwardDatabase } from './walk-forward-database.types.js';
import {
  WALK_FORWARD_MESSAGE_TYPE,
  WALK_FORWARD_REQUEST_MESSAGE_SCHEMA,
  type WalkForwardEvent,
  type WalkForwardThreadRequest,
} from './walk-forward-messages.js';

export type OpenedWalkForwardDatabase = {
  readonly database: WalkForwardDatabase;
  readonly close: () => Promise<void>;
};

// A thread abre o PRÓPRIO banco e o fecha ao terminar: conexão e transação nunca atravessam threads.
export type WalkForwardWorkerDependencies = {
  readonly open: () => Promise<OpenedWalkForwardDatabase>;
  readonly threads: number;
};

type Post = (event: WalkForwardEvent) => void;

function toEvent(outcome: WalkForwardOutcome): WalkForwardEvent {
  if (outcome.status === WALK_FORWARD_OUTCOME_STATUS.COMPLETED) {
    return {
      type: WALK_FORWARD_MESSAGE_TYPE.COMPLETED,
      runId: outcome.runId,
      windows: outcome.windows,
      combinations: outcome.combinations,
      candles: outcome.candles,
      isOverfittingAlert: outcome.overfitting.isAlert,
      phases: outcome.phases,
    };
  }
  if (outcome.status === WALK_FORWARD_OUTCOME_STATUS.CANCELLED) {
    return {
      type: WALK_FORWARD_MESSAGE_TYPE.CANCELLED,
      runId: outcome.runId,
      completedWindows: outcome.completedWindows,
    };
  }
  return {
    type: WALK_FORWARD_MESSAGE_TYPE.FAILED,
    runId: outcome.runId,
    errorCode: outcome.errorCode,
    isRecorded: outcome.isRecorded,
  };
}

async function runOnce(params: {
  readonly dependencies: WalkForwardWorkerDependencies;
  readonly request: WalkForwardThreadRequest;
  readonly post: Post;
}): Promise<WalkForwardEvent> {
  const { request, post } = params;
  const opened = await params.dependencies.open();
  try {
    const outcome = await runWalkForward({
      database: opened.database,
      runId: request.runId,
      options: {
        ...request.request,
        threads: params.dependencies.threads,
        onProgress: (progress) =>
          post({ type: WALK_FORWARD_MESSAGE_TYPE.PROGRESS, runId: request.runId, progress }),
      },
    });
    return toEvent(outcome);
  } finally {
    await opened.close();
  }
}

async function handleMessage(
  dependencies: WalkForwardWorkerDependencies,
  data: unknown,
  post: Post,
): Promise<void> {
  const request = WALK_FORWARD_REQUEST_MESSAGE_SCHEMA.safeParse(data);
  if (!request.success) {
    post({
      type: WALK_FORWARD_MESSAGE_TYPE.FAILED,
      errorCode: WALK_FORWARD_ERROR_CODE.WALK_FORWARD_INVALID_REQUEST,
      isRecorded: false,
    });
    return;
  }
  try {
    post(await runOnce({ dependencies, request: request.data, post }));
  } catch {
    post({
      type: WALK_FORWARD_MESSAGE_TYPE.FAILED,
      runId: request.data.runId,
      errorCode: WALK_FORWARD_ERROR_CODE.WALK_FORWARD_UNEXPECTED,
      isRecorded: false,
    });
  }
}

// Entrada da thread: um pedido `{ runId, request }` por vez, eventos validados de volta. O resultado vai para o
// banco, nunca pela mensagem.
export function serveWalkForwardWorker(dependencies: WalkForwardWorkerDependencies): void {
  if (parentPort === null) throw new Error('serveWalkForwardWorker só roda dentro de uma thread.');
  const port = parentPort;
  const post: Post = (event) => port.postMessage(event);
  port.on('message', (data: unknown) => void handleMessage(dependencies, data, post));
  post({ type: WALK_FORWARD_MESSAGE_TYPE.READY });
}
