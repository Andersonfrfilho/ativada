// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_STATUS,
  type BatchCheckpointParams,
  type RunResultRows,
  type RunStatus,
  type WalkForwardWindowInput,
} from '@cryptoada/database';

import { WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import type { WalkForwardRunSession } from './walk-forward-database.types.js';

export type CommitResult =
  | { readonly kind: 'committed' }
  | { readonly kind: 'stopped'; readonly status: RunStatus }
  | { readonly kind: 'vanished' };

export type CommitUnitParams = {
  readonly session: WalkForwardRunSession;
  readonly checkpoint: BatchCheckpointParams;
  readonly rows?: RunResultRows | undefined;
  readonly windows?: readonly WalkForwardWindowInput[] | undefined;
};

// UMA transação por unidade de trabalho: confere o status (com a execução travada), grava a janela e os resultados
// do teste dela e SÓ ENTÃO o checkpoint. Se algo falha, nada da unidade fica; se a execução já não está `running`,
// nada é gravado (é como o cancelamento é visto entre as unidades).
export async function commitUnit(params: CommitUnitParams): Promise<CommitResult> {
  const { session, checkpoint } = params;
  const result = await session.inBatch(async (writer): Promise<CommitResult> => {
    const status = await writer.readStatus();
    if (status !== RUN_STATUS.RUNNING) return { kind: 'stopped', status };
    if (params.windows !== undefined) await writer.appendWindows(params.windows);
    if (params.rows !== undefined) await writer.appendResults(params.rows);
    if (!(await writer.saveCheckpoint(checkpoint))) {
      throw new WalkForwardRunError(
        WALK_FORWARD_ERROR_CODE.CHECKPOINT_REFUSED,
        'O checkpoint da unidade foi recusado.',
      );
    }
    return { kind: 'committed' };
  });
  return result ?? { kind: 'vanished' };
}
