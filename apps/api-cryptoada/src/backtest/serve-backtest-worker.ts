// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parentPort } from 'node:worker_threads';

import { BACKTEST_ERROR_CODE, BACKTEST_OUTCOME_STATUS } from './backtest.constant.js';
import type { BacktestOutcome } from './backtest.types.js';
import type { BacktestDatabase } from './backtest-database.types.js';
import {
  BACKTEST_MESSAGE_TYPE,
  BACKTEST_REQUEST_SCHEMA,
  type BacktestEvent,
} from './backtest-messages.js';
import { runBacktest } from './run-backtest.js';

export type OpenedBacktestDatabase = {
  readonly database: BacktestDatabase;
  readonly close: () => Promise<void>;
};

// A thread abre o PRÓPRIO banco e o fecha ao terminar: conexão e transação nunca atravessam threads.
export type BacktestWorkerDependencies = {
  readonly open: () => Promise<OpenedBacktestDatabase>;
};

type Post = (event: BacktestEvent) => void;

function toEvent(outcome: BacktestOutcome): BacktestEvent {
  if (outcome.status === BACKTEST_OUTCOME_STATUS.COMPLETED) {
    return {
      type: BACKTEST_MESSAGE_TYPE.COMPLETED,
      runId: outcome.runId,
      processedCandles: outcome.processedCandles,
      batches: outcome.batches,
      gapCandles: outcome.gapCandles,
      phases: outcome.phases,
    };
  }
  if (outcome.status === BACKTEST_OUTCOME_STATUS.CANCELLED) {
    return {
      type: BACKTEST_MESSAGE_TYPE.CANCELLED,
      runId: outcome.runId,
      processedCandles: outcome.processedCandles,
      batches: outcome.batches,
    };
  }
  return {
    type: BACKTEST_MESSAGE_TYPE.FAILED,
    runId: outcome.runId,
    errorCode: outcome.errorCode,
    isRecorded: outcome.isRecorded,
  };
}

async function runOnce(params: {
  readonly dependencies: BacktestWorkerDependencies;
  readonly runId: string;
  readonly post: Post;
}): Promise<BacktestEvent> {
  const { runId, post } = params;
  const opened = await params.dependencies.open();
  try {
    const outcome = await runBacktest({
      database: opened.database,
      runId,
      options: {
        onProgress: (progress) => post({ type: BACKTEST_MESSAGE_TYPE.PROGRESS, runId, progress }),
      },
    });
    return toEvent(outcome);
  } finally {
    await opened.close();
  }
}

async function handleMessage(
  dependencies: BacktestWorkerDependencies,
  data: unknown,
  post: Post,
): Promise<void> {
  const request = BACKTEST_REQUEST_SCHEMA.safeParse(data);
  if (!request.success) {
    post({
      type: BACKTEST_MESSAGE_TYPE.FAILED,
      errorCode: BACKTEST_ERROR_CODE.BACKTEST_INVALID_REQUEST,
      isRecorded: false,
    });
    return;
  }
  const { runId } = request.data;
  try {
    post(await runOnce({ dependencies, runId, post }));
  } catch {
    post({
      type: BACKTEST_MESSAGE_TYPE.FAILED,
      runId,
      errorCode: BACKTEST_ERROR_CODE.BACKTEST_UNEXPECTED,
      isRecorded: false,
    });
  }
}

// Entrada da thread: um pedido `{ runId }` por vez, eventos validados de volta. O resultado (operações, métricas)
// vai para o banco, nunca pela mensagem.
export function serveBacktestWorker(dependencies: BacktestWorkerDependencies): void {
  if (parentPort === null) throw new Error('serveBacktestWorker só roda dentro de uma thread.');
  const port = parentPort;
  const post: Post = (event) => port.postMessage(event);
  port.on('message', (data: unknown) => void handleMessage(dependencies, data, post));
  post({ type: BACKTEST_MESSAGE_TYPE.READY });
}
