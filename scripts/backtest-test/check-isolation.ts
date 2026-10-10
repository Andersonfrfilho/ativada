// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunBatchRepository,
  createRunRepository,
  createRunResultRepository,
  resolveRunOwnerScope,
  RUN_STATUS,
  RUN_TRANSITION_OUTCOME,
} from '../../packages/database/src/index.js';
import {
  assertCondition,
  createBacktestRun,
  createTestRunner,
  reportLine,
  type BacktestTestContext,
} from './backtest-test-context.js';
import { SYMBOL, TIMEFRAME, type SyntheticWindow } from './check-two-years.js';

type CountRow = { readonly total: number };

async function countRowsOf(client: Bun.SQL, runId: string, userId: string): Promise<number> {
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM signals WHERE run_id = ${runId} AND user_id = ${userId}`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

async function readUserId(client: Bun.SQL, subject: string): Promise<string> {
  const rows: unknown = await client`SELECT id FROM users WHERE keycloak_sub = ${subject}`;
  const id = (rows as readonly { readonly id: string }[])[0]?.id;
  if (id === undefined) throw new Error('usuário não encontrado');
  return id;
}

export async function checkIsolation(
  context: BacktestTestContext,
  completedRunId: string,
): Promise<void> {
  const { handle, client, owner, other } = context;
  const runs = createRunRepository(handle);
  const results = createRunResultRepository(handle);
  const page = { limit: 10, after: undefined };
  assertCondition(
    (await runs.findRun(other.scope, completedRunId)) === undefined,
    'B leu a execução de A',
  );
  assertCondition(
    (await runs.readCheckpoint(other.scope, completedRunId)) === undefined,
    'B leu o checkpoint de A',
  );
  assertCondition(
    (await results.listEquityPoints(other.scope, completedRunId, page)) === undefined,
    'B leu o patrimônio de A',
  );
  assertCondition(
    (await results.listSignals(other.scope, completedRunId, page)) === undefined,
    'B leu os sinais de A',
  );
  assertCondition(
    (await results.listPositions(other.scope, completedRunId, { limit: 10, after: undefined })) ===
      undefined,
    'B leu as posições de A',
  );
  const cancel = await runs.transitionRun(other.scope, {
    runId: completedRunId,
    to: RUN_STATUS.CANCELLED,
  });
  assertCondition(cancel.outcome === RUN_TRANSITION_OUTCOME.NOT_FOUND, 'B alterou a execução de A');
  const opened = await createRunBatchRepository(handle).runInBatch(
    other.scope,
    completedRunId,
    (writer) => writer.readStatus(),
  );
  assertCondition(opened === undefined, 'B abriu um lote na execução de A');
  const stolen = await runs.createRun(other.scope, {
    strategyVersionId: context.strategyVersionId,
    kind: 'backtest',
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    runParameters: {},
    runHash: 'f'.repeat(64),
    engineVersion: 'x',
    signalEngineVersion: 'x',
    metricsVersion: 'x',
    periodStart: 0,
    periodEnd: 1,
    migratedFromRunId: undefined,
  });
  assertCondition(stolen === undefined, 'B criou execução sobre a versão de A');
  const resolved = await resolveRunOwnerScope(handle, completedRunId);
  assertCondition(
    resolved?.ownerUserId === (await readUserId(client, owner.subject)),
    'o dono resolvido não é A',
  );
  const otherId = await readUserId(client, other.subject);
  assertCondition(
    (await countRowsOf(client, completedRunId, otherId)) === 0,
    'há linha de B na execução de A',
  );
  reportLine(
    'ISOLAMENTO: B não lê, lista, altera, cancela nem abre lote na execução de A, nem cria execução sobre a versão dela; o dono resolvido é A e não há linha de B',
  );
}

export async function checkInactiveOwnerDoesNotRun(
  context: BacktestTestContext,
  window: SyntheticWindow,
): Promise<void> {
  const { handle, client, owner } = context;
  const run = await createBacktestRun(context, { symbol: SYMBOL, timeframe: TIMEFRAME, ...window });
  const userId = await readUserId(client, owner.subject);
  await client`UPDATE users SET blocked_at = now() WHERE id = ${userId}`;
  try {
    const outcome = await createTestRunner(context).run(run.id);
    assertCondition(
      outcome.status === 'failed' && outcome.errorCode === 'RUN_NOT_FOUND' && !outcome.isRecorded,
      'dono bloqueado não pode ter execução em andamento',
    );
    const stored = await createRunRepository(handle).findRun(owner.scope, run.id);
    assertCondition(
      stored?.status === RUN_STATUS.QUEUED,
      'a execução do dono bloqueado mudou de estado',
    );
    assertCondition(
      (await countRowsOf(client, run.id, userId)) === 0,
      'gravou resultado para dono bloqueado',
    );
  } finally {
    await client`UPDATE users SET blocked_at = NULL WHERE id = ${userId}`;
  }
  reportLine(
    'ISOLAMENTO: execução de dono bloqueado não roda (RUN_NOT_FOUND, continua queued, nada gravado)',
  );
}
