// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRunQueueRepository } from '../src/run-queue/run-queue.repository.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import { RUN_STATUS } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import { RUN_DELETE_OUTCOME } from '../src/runs/run.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode, resolvePersistenceOwner, seedRun } from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';

export async function checkRunDeletion(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-run-delete-owner');
  const stranger = await resolvePersistenceOwner(handle, 'subject-run-delete-stranger');
  const runs = createRunRepository(handle);
  const queue = createRunQueueRepository(handle);
  const results = createRunResultRepository(handle);
  const finished = await seedRun(handle, owner);
  const active = await seedRun(handle, owner);
  await runs.transitionRun(owner.scope, { runId: finished.id, to: RUN_STATUS.RUNNING });
  await runs.transitionRun(owner.scope, { runId: finished.id, to: RUN_STATUS.COMPLETED });
  const before = await queue.countStoredRuns(owner.scope);
  assertCondition(
    (await runs.deleteRun(stranger.scope, finished.id)) === RUN_DELETE_OUTCOME.NOT_FOUND,
    'outro usuário não apaga a execução (not_found, como a inexistente)',
  );
  assertCondition(
    (await runs.deleteRun(owner.scope, active.id)) === RUN_DELETE_OUTCOME.NOT_FINISHED,
    'a execução ainda na fila não se apaga',
  );
  const running = await seedRun(handle, owner);
  await runs.transitionRun(owner.scope, { runId: running.id, to: RUN_STATUS.RUNNING });
  assertCondition(
    (await runs.deleteRun(owner.scope, running.id)) === RUN_DELETE_OUTCOME.NOT_FINISHED,
    'a execução rodando também não se apaga',
  );
  assertCondition(
    (await runs.deleteRun(owner.scope, crypto.randomUUID())) === RUN_DELETE_OUTCOME.NOT_FOUND,
    'a inexistente é not_found',
  );
  assertCondition(
    (await runs.deleteRun(owner.scope, finished.id)) === RUN_DELETE_OUTCOME.DELETED,
    'a terminada do dono é apagada',
  );
  assertCondition(
    (await runs.deleteRun(owner.scope, finished.id)) === RUN_DELETE_OUTCOME.NOT_FOUND,
    'apagar de novo é not_found',
  );
  assertCondition((await runs.findRun(owner.scope, finished.id)) === undefined, 'findRun não a vê');
  const page = await runs.listRuns(owner.scope, { limit: 50, after: undefined, kind: undefined });
  assertCondition(
    page.runs.every((row) => row.id !== finished.id),
    'listRuns não a lista',
  );
  assertCondition(
    (await results.listSignals(owner.scope, finished.id, { limit: 10, after: undefined })) ===
      undefined,
    'as séries dela também somem (a posse não a reconhece)',
  );
  assertCondition(
    (await queue.countStoredRuns(owner.scope)) === before - 1,
    'a cota de execuções guardadas libera a vaga',
  );
  const rows: unknown = await client`SELECT deleted_at FROM runs WHERE id = ${finished.id}`;
  assertCondition(
    (rows as readonly { deleted_at: Date | null }[])[0]?.deleted_at !== null,
    'a linha continua guardada, só marcada',
  );
  const refused = await captureErrorCode(
    client`UPDATE runs SET deleted_at = now() WHERE id = ${active.id}`,
  );
  assertCondition(
    refused === CHECK_VIOLATION_SQLSTATE,
    `o banco recusa apagar execução não terminada (${refused})`,
  );
  reportCheck(
    'execuções: só a terminada do dono se apaga; some das leituras, libera a cota e o banco recusa a ativa',
  );
}
