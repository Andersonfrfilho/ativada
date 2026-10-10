// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, RUN_TRANSITION_OUTCOME } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import { resolveRunOwnerScope } from '../src/runs/run-owner.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import type { RunResultRows } from '../src/run-results/run-batch.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildCommands,
  buildEquityPoints,
  buildFills,
  buildOrders,
  buildPositions,
  buildSignals,
  candleTimeAt,
  resolvePersistenceOwner,
  seedRun,
} from './persistence-seed.js';

const ROWS = 40;
const FORGED_ERROR = 'falha injetada no meio do lote';

type CountRow = { readonly total: number };

function buildRows(): RunResultRows {
  return {
    signals: buildSignals(ROWS),
    orders: buildOrders(ROWS),
    fills: buildFills(ROWS),
    positions: buildPositions(ROWS),
    equityPoints: buildEquityPoints(ROWS),
    commands: buildCommands(2),
  };
}

const RESULT_TABLES = ['signals', 'orders', 'fills', 'positions', 'equity_points', 'run_commands'];

async function countRows(client: Bun.SQL, runId: string): Promise<number> {
  let total = 0;
  for (const table of RESULT_TABLES) {
    const rows: unknown = await client.unsafe(
      `SELECT count(*)::int AS total FROM ${table} WHERE run_id = $1`,
      [runId],
    );
    total += (rows as readonly CountRow[])[0]?.total ?? 0;
  }
  return total;
}

async function startRun(context: LifecycleCheckContext, subject: string): Promise<RunScope> {
  const owner = await resolvePersistenceOwner(context.handle, subject);
  const run = await seedRun(context.handle, owner);
  const started = await createRunRepository(context.handle).transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.RUNNING,
  });
  context.assertCondition(
    started.outcome === RUN_TRANSITION_OUTCOME.TRANSITIONED,
    'execução não iniciou',
  );
  return { owner, runId: run.id };
}

type RunScope = {
  readonly owner: Awaited<ReturnType<typeof resolvePersistenceOwner>>;
  readonly runId: string;
};

export async function checkRunOwnerResolution(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const { owner, runId } = await startRun(context, 'subject-batch-resolve');
  const scope = await resolveRunOwnerScope(handle, runId);
  assertCondition(scope?.ownerUserId === owner.userId, 'o dono resolvido não é o da execução');
  const unknown = await resolveRunOwnerScope(handle, crypto.randomUUID());
  assertCondition(unknown === undefined, 'execução inexistente não resolve dono');
  const malformed = await resolveRunOwnerScope(handle, "not-a-uuid'; DROP TABLE runs; --");
  assertCondition(malformed === undefined, 'identificador malformado não resolve dono');
  await client`UPDATE users SET blocked_at = now() WHERE id = ${owner.userId}`;
  assertCondition(
    (await resolveRunOwnerScope(handle, runId)) === undefined,
    'conta bloqueada não resolve dono',
  );
  await client`UPDATE users SET blocked_at = NULL, deleted_at = now() WHERE id = ${owner.userId}`;
  assertCondition(
    (await resolveRunOwnerScope(handle, runId)) === undefined,
    'conta apagada não resolve dono',
  );
  await client`UPDATE users SET deleted_at = NULL WHERE id = ${owner.userId}`;
  reportCheck(
    'resolveRunOwnerScope: dono ativo resolve; inexistente, malformado, bloqueado e apagado não',
  );
}

export async function checkBatchCommitAndRollback(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const { owner, runId } = await startRun(context, 'subject-batch-commit');
  const batches = createRunBatchRepository(handle);
  const rows = buildRows();
  const committed = await batches.runInBatch(owner.scope, runId, async (writer) => {
    assertCondition(
      (await writer.readStatus()) === RUN_STATUS.RUNNING,
      'status lido dentro do lote',
    );
    const appended = await writer.appendResults(rows);
    const saved = await writer.saveCheckpoint({
      engineState: { marker: 'checkpoint-1' },
      lastCandleTime: candleTimeAt(ROWS),
      progress: 10,
    });
    return { written: appended.written, saved };
  });
  if (committed === undefined) throw new Error('o lote não abriu para o dono');
  assertCondition(committed.saved, 'checkpoint dentro do lote foi recusado');
  const expected = ROWS * 5 + 2;
  assertCondition(
    committed.written === expected,
    `lote gravou ${committed.written}, esperado ${expected}`,
  );
  const checkpoint = await createRunRepository(handle).readCheckpoint(owner.scope, runId);
  assertCondition(
    checkpoint?.lastCandleTime === candleTimeAt(ROWS),
    'checkpoint não ficou gravado',
  );
  const before = await countRows(client, runId);
  let failure: unknown;
  try {
    await batches.runInBatch(owner.scope, runId, async (writer) => {
      await writer.appendResults({ ...rows, signals: buildSignals(ROWS + 10) });
      await writer.saveCheckpoint({
        engineState: { marker: 'checkpoint-2' },
        lastCandleTime: candleTimeAt(ROWS + 10),
        progress: 20,
      });
      throw new Error(FORGED_ERROR);
    });
  } catch (error: unknown) {
    failure = error;
  }
  assertCondition(
    failure instanceof Error && failure.message === FORGED_ERROR,
    'o erro não propagou',
  );
  assertCondition((await countRows(client, runId)) === before, 'lote que falhou deixou linhas');
  const after = await createRunRepository(handle).readCheckpoint(owner.scope, runId);
  assertCondition(
    after?.lastCandleTime === candleTimeAt(ROWS),
    'lote que falhou moveu o checkpoint',
  );
  reportCheck('runInBatch: resultados e checkpoint na mesma transação; falha desfaz tudo');
}

export async function checkBatchGuards(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const { owner, runId } = await startRun(context, 'subject-batch-guard');
  const stranger = await resolvePersistenceOwner(handle, 'subject-batch-stranger');
  const batches = createRunBatchRepository(handle);
  let opened = false;
  const foreign = await batches.runInBatch(stranger.scope, runId, (writer) => {
    opened = true;
    return writer.readStatus();
  });
  assertCondition(foreign === undefined && !opened, 'outro dono abriu o lote');
  assertCondition((await countRows(client, runId)) === 0, 'outro dono gravou');
  const absent = await batches.runInBatch(owner.scope, crypto.randomUUID(), (writer) =>
    writer.readStatus(),
  );
  assertCondition(absent === undefined, 'execução inexistente abriu lote');
  await batches.runInBatch(owner.scope, runId, (writer) =>
    writer.saveCheckpoint({
      engineState: { marker: 'a' },
      lastCandleTime: candleTimeAt(5),
      progress: 5,
    }),
  );
  const stale = await batches.runInBatch(owner.scope, runId, (writer) =>
    writer.saveCheckpoint({
      engineState: { marker: 'b' },
      lastCandleTime: candleTimeAt(5),
      progress: 5,
    }),
  );
  assertCondition(stale === false, 'checkpoint sem avanço foi aceito');
  await createRunRepository(handle).transitionRun(owner.scope, { runId, to: RUN_STATUS.CANCELLED });
  const status = await batches.runInBatch(owner.scope, runId, (writer) => writer.readStatus());
  assertCondition(status === RUN_STATUS.CANCELLED, 'o lote não viu o cancelamento');
  const refused = await batches.runInBatch(owner.scope, runId, (writer) =>
    writer.saveCheckpoint({
      engineState: { marker: 'c' },
      lastCandleTime: candleTimeAt(9),
      progress: 9,
    }),
  );
  assertCondition(refused === false, 'checkpoint de execução cancelada foi aceito');
  reportCheck(
    'runInBatch: outro dono e execução inexistente não abrem lote; checkpoint só avança em `running`',
  );
}

export async function checkCancelWaitsForTheBatch(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const { owner, runId } = await startRun(context, 'subject-batch-race');
  const batches = createRunBatchRepository(handle);
  const runs = createRunRepository(handle);
  let cancelSettledInsideBatch = true;
  let cancel: Promise<unknown> = Promise.resolve();
  await batches.runInBatch(owner.scope, runId, async (writer) => {
    await writer.readStatus();
    cancel = runs.transitionRun(owner.scope, { runId, to: RUN_STATUS.CANCELLED });
    cancel.then(
      () => undefined,
      () => undefined,
    );
    const lockWindow = Bun.sleep(300).then(() => 'timer');
    const winner = await Promise.race([cancel.then(() => 'cancel'), lockWindow]);
    cancelSettledInsideBatch = winner === 'cancel';
    await writer.appendResults(buildRows());
  });
  await cancel;
  assertCondition(!cancelSettledInsideBatch, 'o cancelamento atravessou o lote em andamento');
  const final = await runs.findRun(owner.scope, runId);
  assertCondition(final?.status === RUN_STATUS.CANCELLED, 'o cancelamento se perdeu');
  reportCheck('runInBatch: o cancelamento concorrente espera o fim do lote e vale depois dele');
}

export async function checkCompletionSetsFullProgress(
  context: LifecycleCheckContext,
): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const { owner, runId } = await startRun(context, 'subject-batch-progress');
  const runs = createRunRepository(handle);
  const done = await runs.transitionRun(owner.scope, {
    runId,
    to: RUN_STATUS.COMPLETED,
    metrics: { totalReturn: '0.1' },
  });
  assertCondition(
    done.outcome === RUN_TRANSITION_OUTCOME.TRANSITIONED && done.run.progress === 100,
    'completed deve gravar progress = 100',
  );
  reportCheck('transitionRun(completed) grava progress = 100');
}
