// Copyright (c) 2026 Ada Technology. All rights reserved.
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createLiveUser,
  createProductionEvaluator,
  errorsOf,
  LEAD_IN_CANDLES,
  readProgress,
  reportLine,
  tickUntilQuiet,
  type LiveTestContext,
} from './live-test-context.js';

const STEPS_BEFORE = 12;

function requireMarket(): { symbol: string; periodStart: number } {
  const dataset = REAL_DATASETS[0];
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || first === undefined) throw new Error('sem conjunto real');
  return { symbol: dataset.market.symbol, periodStart: first.openTime };
}

async function checkDeletedMidRun(context: LiveTestContext): Promise<void> {
  const user = await createLiveUser(context, 'deleted-mid-run');
  const market = requireMarket();
  const run = await createLiveRun(context, { ...market, timeframe: '1h', user });
  const { evaluator, entries } = createProductionEvaluator(context, {
    instanceId: 'accounts-deleted',
    maxStepsPerPass: STEPS_BEFORE,
  });
  await evaluator.tick();
  assertCondition(
    (await readProgress(context, run.id)).status === 'running',
    'a simulação devia estar rodando antes da exclusão',
  );
  await context.client.unsafe('UPDATE users SET deleted_at = now() WHERE keycloak_sub = $1', [
    user.subject,
  ]);
  const totals = await tickUntilQuiet(evaluator);
  const after = await readProgress(context, run.id);
  assertCondition(after.status === 'cancelled', `conta apagada: a simulação ficou ${after.status}`);
  assertCondition(totals.steps === 0 && totals.failed === 0, 'passos ou falhas depois da exclusão');
  assertCondition(errorsOf(entries).length === 0, 'a exclusão da conta gerou erro');
  reportLine(
    `conta apagada no meio (${STEPS_BEFORE} passos feitos): a ronda cancela a simulação, nenhum passo a mais, nenhuma falha e nenhum erro no log`,
  );
}

async function checkPurgedMidStep(context: LiveTestContext): Promise<void> {
  const user = await createLiveUser(context, 'purged-mid-step');
  const market = requireMarket();
  const run = await createLiveRun(context, { ...market, timeframe: '1h', user });
  let isPurged = false;
  const { evaluator, entries, committed } = createProductionEvaluator(context, {
    instanceId: 'accounts-purged',
    beforeCommit: async (runId) => {
      if (isPurged || (committed.get(runId) ?? 0) < STEPS_BEFORE) return;
      isPurged = true;
      // Os dados da conta somem entre dois passos (a purga da exclusão): a linha da execução deixa de existir.
      await context.client.unsafe('DELETE FROM equity_points WHERE run_id = $1', [runId]);
      await context.client.unsafe('DELETE FROM orders WHERE run_id = $1', [runId]);
      await context.client.unsafe('DELETE FROM signals WHERE run_id = $1', [runId]);
      await context.client.unsafe('DELETE FROM runs WHERE id = $1', [runId]);
    },
  });
  const totals = await tickUntilQuiet(evaluator);
  assertCondition(isPurged, 'a purga não aconteceu');
  assertCondition(totals.failed === 0, 'a purga no meio do passo virou falha');
  assertCondition(errorsOf(entries).length === 0, 'a purga no meio do passo gerou erro no log');
  const rows: unknown = await context.client.unsafe(
    'SELECT count(*)::int AS total FROM runs WHERE id = $1',
    [run.id],
  );
  assertCondition((rows as { total: number }[])[0]?.total === 0, 'a execução devia ter sumido');
  reportLine(
    'dados da conta apagados entre dois passos: a execução termina sem erro e sem falha gravada (o passo seguinte não encontra a execução)',
  );
}

async function checkBlockedNeverStarts(context: LiveTestContext): Promise<void> {
  const user = await createLiveUser(context, 'blocked');
  const market = requireMarket();
  const run = await createLiveRun(context, { ...market, timeframe: '1h', user });
  await context.client.unsafe('UPDATE users SET blocked_at = now() WHERE keycloak_sub = $1', [
    user.subject,
  ]);
  const { evaluator, committed } = createProductionEvaluator(context, {
    instanceId: 'accounts-blocked',
  });
  const totals = await tickUntilQuiet(evaluator);
  const progress = await readProgress(context, run.id);
  assertCondition(totals.claimed === 0 && totals.steps === 0, 'conta bloqueada foi avaliada');
  assertCondition(
    progress.status === 'queued' && progress.claimedBy === null,
    'conta bloqueada reivindicada',
  );
  assertCondition((committed.get(run.id) ?? 0) === 0, 'passo gravado para conta bloqueada');
  await context.client.unsafe('UPDATE users SET blocked_at = NULL WHERE keycloak_sub = $1', [
    user.subject,
  ]);
  await tickUntilQuiet(evaluator);
  assertCondition(
    (await readProgress(context, run.id)).status === 'running',
    'desbloqueada, a simulação devia rodar',
  );
  await cancelRun(context, { runId: run.id, user });
  reportLine(
    'conta bloqueada: a simulação na fila não é reivindicada nem avaliada; desbloqueada, entra na fila normal',
  );
}

// Conta apagada ou bloqueada não é avaliada e o término no meio é encerramento, nunca erro (ADR 0001 §k).
export async function checkClosedAccounts(context: LiveTestContext): Promise<void> {
  await checkBlockedNeverStarts(context);
  await checkDeletedMidRun(context);
  await checkPurgedMidStep(context);
}
