// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_STATUS,
  type OwnerScope,
  type RunQueuePosition,
  type RunQueueRepository,
  type RunRecord,
} from '@ativada/database';

export type RunQueuePositionDependencies = {
  readonly queue: Pick<RunQueueRepository, 'findQueuePosition'>;
};

// Só a execução `queued` tem posição: a do dono entre as dele e a global como número. Nenhuma linha de outro usuário
// sai daqui, e o repositório só devolve a posição de execução do próprio dono.
export async function readQueuePosition(
  dependencies: RunQueuePositionDependencies,
  scope: OwnerScope,
  run: Pick<RunRecord, 'id' | 'status'>,
): Promise<RunQueuePosition | null> {
  if (run.status !== RUN_STATUS.QUEUED) return null;
  return (await dependencies.queue.findQueuePosition(scope, run.id)) ?? null;
}
