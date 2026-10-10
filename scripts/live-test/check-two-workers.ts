// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readPersistedRun } from '../backtest-test/read-run-rows.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { TICK_PAUSE_MILLISECONDS } from './live-test.constant.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createLiveUser,
  createProductionEvaluator,
  digestOf,
  errorsOf,
  LEAD_IN_CANDLES,
  readProgress,
  reportLine,
  waitFor,
  type LiveTestContext,
  type LiveUser,
  type ProductionEvaluator,
} from './live-test-context.js';

const USERS = 3;
const RUNS_PER_USER = 2;

async function loop(worker: ProductionEvaluator, isDone: () => Promise<boolean>): Promise<void> {
  while (!(await isDone())) {
    await worker.evaluator.tick();
    await Bun.sleep(TICK_PAUSE_MILLISECONDS);
  }
}

async function checkSharedWork(context: LiveTestContext): Promise<void> {
  const dataset = REAL_DATASETS[0];
  const reference = dataset === undefined ? undefined : context.references.get(dataset.name);
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || reference === undefined || first === undefined) {
    throw new Error('sem a referência da paridade');
  }
  const users: LiveUser[] = [];
  for (let index = 0; index < USERS; index += 1)
    users.push(await createLiveUser(context, `two-workers-${index}`));
  const runs: { readonly runId: string; readonly user: LiveUser }[] = [];
  for (const user of users) {
    for (let count = 0; count < RUNS_PER_USER; count += 1) {
      const run = await createLiveRun(context, {
        symbol: dataset.market.symbol,
        timeframe: '1h',
        periodStart: first.openTime,
        user,
      });
      runs.push({ runId: run.id, user });
    }
  }
  const workerA = createProductionEvaluator(context, { instanceId: 'worker-a' });
  const workerB = createProductionEvaluator(context, { instanceId: 'worker-b' });
  const runIds = runs.map((item) => item.runId);
  const isDone = async (): Promise<boolean> => {
    const progress = await Promise.all(runIds.map((id) => readProgress(context, id)));
    return progress.every((item) => item.lastCandleTime === reference.lastCandleTime);
  };
  await Promise.all([loop(workerA, isDone), loop(workerB, isDone)]);
  for (const { runId, user } of runs) {
    const byA = workerA.committed.get(runId) ?? 0;
    const byB = workerB.committed.get(runId) ?? 0;
    assertCondition(
      (byA === 0) !== (byB === 0),
      `a simulação ${runId} foi avaliada pelos dois (${byA} e ${byB})`,
    );
    assertCondition(
      byA + byB === dataset.candles.length,
      `${byA + byB} passos em vez de ${dataset.candles.length}`,
    );
    const persisted = await readPersistedRun(context.backtest, runId, {
      subject: user.subject,
      scope: user.scope,
    });
    assertCondition(
      digestOf(persisted.rows) === reference.rowsDigest,
      'resultado difere do contínuo',
    );
    const progress = await readProgress(context, runId);
    assertCondition(
      progress.claimedBy === (byA > 0 ? 'worker-a' : 'worker-b'),
      `o dono gravado (${progress.claimedBy}) não é quem avaliou`,
    );
  }
  assertCondition(
    errorsOf(workerA.entries).length + errorsOf(workerB.entries).length === 0,
    'erro registrado',
  );
  const sharedA = runIds.filter((id) => (workerA.committed.get(id) ?? 0) > 0).length;
  assertCondition(
    sharedA > 0 && sharedA < runIds.length,
    `um worker pegou tudo (${sharedA} de ${runIds.length})`,
  );
  for (const { runId, user } of runs) await cancelRun(context, { runId, user });
  reportLine(
    `dois workers reais sobre o mesmo banco, ${runIds.length} simulações de ${USERS} usuários: cada uma foi avaliada por UM só (${sharedA} por A, ${runIds.length - sharedA} por B), todas com o resultado do contínuo e o dono gravado = quem avaliou`,
  );
}

async function checkUserCap(context: LiveTestContext): Promise<void> {
  const dataset = REAL_DATASETS[0];
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || first === undefined) throw new Error('sem conjunto real');
  const user = await createLiveUser(context, 'cap');
  await context.client.unsafe(
    `UPDATE users SET limits = '{"maxActiveLivePaperRuns": 1}'::jsonb WHERE keycloak_sub = $1`,
    [user.subject],
  );
  const params = {
    symbol: dataset.market.symbol,
    timeframe: '1h',
    periodStart: first.openTime,
    user,
  } as const;
  const firstRun = await createLiveRun(context, params);
  const secondRun = await createLiveRun(context, params);
  const worker = createProductionEvaluator(context, { instanceId: 'cap-worker' });
  for (let tick = 0; tick < 4; tick += 1) await worker.evaluator.tick();
  assertCondition(
    (await readProgress(context, firstRun.id)).status === 'running',
    'a 1ª devia rodar',
  );
  const waiting = await readProgress(context, secondRun.id);
  assertCondition(
    waiting.status === 'queued' && (worker.committed.get(secondRun.id) ?? 0) === 0,
    'o teto de 1 simulação ativa não foi respeitado',
  );
  await cancelRun(context, { runId: firstRun.id, user });
  await waitFor('a vaga liberada servir a 2ª', async () => {
    await worker.evaluator.tick();
    return (await readProgress(context, secondRun.id)).status === 'running';
  });
  await cancelRun(context, { runId: secondRun.id, user });
  reportLine(
    'teto por usuário no worker: com maxActiveLivePaperRuns = 1 a 2ª espera na fila e entra quando a 1ª é encerrada',
  );
}

export async function checkTwoWorkers(context: LiveTestContext): Promise<void> {
  await checkSharedWork(context);
  await checkUserCap(context);
}
