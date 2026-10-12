// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, type BatchCheckpointParams, type RunStatus } from '@ativada/database';
import { toRunResultRows, type BatchBuffer } from '@ativada/run-recording';

import { BACKTEST_ERROR_CODE } from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';
import type { BacktestRunSession } from './backtest-database.types.js';

export type FlushResult =
  | { readonly kind: 'committed' }
  | { readonly kind: 'stopped'; readonly status: RunStatus }
  | { readonly kind: 'vanished' };

export type FlushBatchParams = {
  readonly session: BacktestRunSession;
  readonly buffer: BatchBuffer;
  readonly checkpoint: BatchCheckpointParams;
};

// UMA transação por lote: confere o status (com a execução travada), grava os resultados e SÓ ENTÃO o
// checkpoint. Se algo falha, nada do lote fica; se a execução já não está `running`, nada é gravado.
export async function flushBatch(params: FlushBatchParams): Promise<FlushResult> {
  const { session, buffer, checkpoint } = params;
  const result = await session.inBatch(async (writer): Promise<FlushResult> => {
    const status = await writer.readStatus();
    if (status !== RUN_STATUS.RUNNING) return { kind: 'stopped', status };
    await writer.appendResults(toRunResultRows(buffer));
    if (!(await writer.saveCheckpoint(checkpoint))) {
      throw new BacktestError(
        BACKTEST_ERROR_CODE.CHECKPOINT_REFUSED,
        'O checkpoint do lote foi recusado.',
      );
    }
    return { kind: 'committed' };
  });
  return result ?? { kind: 'vanished' };
}
