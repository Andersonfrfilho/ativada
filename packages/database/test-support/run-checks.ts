// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, RUN_STATUS, RUN_TRANSITION_OUTCOME } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import type { RunCursor } from '../src/runs/run.types.js';
import { createStrategyRepository } from '../src/strategies/strategy.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildRunParams,
  resolvePersistenceOwner,
  seedRun,
  seedStrategyVersion,
  captureErrorCode,
} from './persistence-seed.js';

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const ORPHAN_ERROR_CODE = 'ORPHANED_AT_BOOT';
const PAGED_RUNS = 23;
const PAGE_SIZE = 7;

type TypeRow = { readonly kind: string };

async function checkCreateAndTransitions(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-run-owner');
  const other = await resolvePersistenceOwner(handle, 'subject-run-other');
  const runs = createRunRepository(handle);
  const alienVersion = await seedStrategyVersion(handle, other);
  const refused = await runs.createRun(owner.scope, buildRunParams(alienVersion.id));
  assertCondition(refused === undefined, 'versão de outro dono não pode gerar execução');
  const run = await seedRun(handle, owner);
  assertCondition(run.status === RUN_STATUS.QUEUED && run.progress === 0, 'nasce queued, 0%');
  const rows: unknown =
    await client`SELECT jsonb_typeof(run_parameters) AS kind FROM runs WHERE id = ${run.id}`;
  assertCondition((rows as readonly TypeRow[])[0]?.kind === 'object', 'run_parameters é objeto');
  const invalidFirst = await runs.transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.COMPLETED,
  });
  assertCondition(
    invalidFirst.outcome === RUN_TRANSITION_OUTCOME.INVALID_TRANSITION,
    'queued -> completed é inválida',
  );
  const started = await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  assertCondition(
    started.outcome === RUN_TRANSITION_OUTCOME.TRANSITIONED && started.run.startedAt !== undefined,
    'queued -> running grava started_at',
  );
  const backwards = await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.QUEUED });
  assertCondition(
    backwards.outcome === RUN_TRANSITION_OUTCOME.INVALID_TRANSITION,
    'running -> queued',
  );
  const repeated = await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  assertCondition(
    repeated.outcome === RUN_TRANSITION_OUTCOME.INVALID_TRANSITION,
    'running -> running',
  );
  const metrics = { totalReturn: '0.12' };
  const done = await runs.transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.COMPLETED,
    metrics,
  });
  assertCondition(
    done.outcome === RUN_TRANSITION_OUTCOME.TRANSITIONED &&
      done.run.finishedAt !== undefined &&
      Bun.deepEquals(done.run.metrics, metrics),
    'running -> completed grava finished_at e métricas',
  );
  for (const target of [RUN_STATUS.RUNNING, RUN_STATUS.FAILED, RUN_STATUS.CANCELLED]) {
    const afterFinal = await runs.transitionRun(owner.scope, { runId: run.id, to: target });
    assertCondition(
      afterFinal.outcome === RUN_TRANSITION_OUTCOME.INVALID_TRANSITION,
      `estado final não regride para ${target}`,
    );
  }
  const unknown = await runs.transitionRun(owner.scope, {
    runId: crypto.randomUUID(),
    to: RUN_STATUS.RUNNING,
  });
  assertCondition(unknown.outcome === RUN_TRANSITION_OUTCOME.NOT_FOUND, 'execução inexistente');
  const typeRows: unknown =
    await client`SELECT jsonb_typeof(metrics) AS kind FROM runs WHERE id = ${run.id}`;
  assertCondition((typeRows as readonly TypeRow[])[0]?.kind === 'object', 'metrics é jsonb object');
  reportCheck(
    'execução: transições válidas e monotônicas; estado final não regride; versão alheia recusada',
  );
}

// O pedido do walk-forward (grade e janelas) mora na linha: nasce com a execução, volta idêntico na leitura e é nulo
// quando a execução não tem pedido (backtest).
async function checkRequest(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-run-request-owner');
  const runs = createRunRepository(handle);
  const version = await seedStrategyVersion(handle, owner);
  const request = {
    grid: { parameters: [{ path: 'thresholds.buy', values: ['1', '1.5'] }] },
    trainMonths: 6,
  };
  const walkForward = await runs.createRun(
    owner.scope,
    buildRunParams(version.id, { kind: RUN_KIND.WALK_FORWARD, request }),
  );
  assertCondition(
    JSON.stringify(walkForward?.request) === JSON.stringify(request),
    'o pedido gravado volta idêntico',
  );
  const found = await runs.findRun(owner.scope, walkForward?.id ?? '');
  assertCondition(
    JSON.stringify(found?.request) === JSON.stringify(request),
    'findRun traz o pedido',
  );
  const rows: unknown =
    await client`SELECT jsonb_typeof(request) AS kind FROM runs WHERE id = ${walkForward?.id ?? ''}`;
  assertCondition((rows as readonly TypeRow[])[0]?.kind === 'object', 'request é jsonb objeto');
  const backtest = await runs.createRun(owner.scope, buildRunParams(version.id));
  assertCondition(backtest?.request === undefined, 'sem pedido, request é nulo');
  reportCheck('runs.request: grava, devolve idêntico e é nulo sem pedido');
}

async function checkCheckpoint(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-run-owner');
  const runs = createRunRepository(handle);
  const run = await seedRun(handle, owner);
  const state = { version: 1, nested: { wallet: ['a'] } };
  const early = { runId: run.id, engineState: state, lastCandleTime: 100, progress: 10 };
  assertCondition(!(await runs.saveCheckpoint(owner.scope, early)), 'queued não grava checkpoint');
  await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
  assertCondition(await runs.saveCheckpoint(owner.scope, early), 'running grava checkpoint');
  const older = { ...early, lastCandleTime: 50, progress: 5 };
  assertCondition(!(await runs.saveCheckpoint(owner.scope, older)), 'checkpoint não regride');
  assertCondition(!(await runs.saveCheckpoint(owner.scope, early)), 'mesmo candle não regrava');
  assertCondition(
    await runs.saveCheckpoint(owner.scope, { ...early, lastCandleTime: 200, progress: 40 }),
    'candle posterior avança',
  );
  assertCondition(
    await runs.saveCheckpoint(owner.scope, { ...early, lastCandleTime: 300, progress: 20 }),
    'candle posterior avança mesmo com progresso menor',
  );
  const checkpoint = await runs.readCheckpoint(owner.scope, run.id);
  assertCondition(
    checkpoint?.lastCandleTime === 300 &&
      checkpoint.progress === 40 &&
      Bun.deepEquals(checkpoint.engineState, state),
    'checkpoint lido é o último gravado, com o estado em jsonb',
  );
  await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.CANCELLED });
  const afterFinal = { ...early, lastCandleTime: 999, progress: 99 };
  assertCondition(
    !(await runs.saveCheckpoint(owner.scope, afterFinal)),
    'final não grava checkpoint',
  );
  reportCheck(
    'checkpoint: só em execução running, last_candle_time monotônico, estado jsonb íntegro',
  );
}

async function checkListing(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-run-lister');
  const other = await resolvePersistenceOwner(handle, 'subject-run-lister-other');
  const runs = createRunRepository(handle);
  const version = await seedStrategyVersion(handle, owner);
  const created: string[] = [];
  for (let index = 0; index < PAGED_RUNS; index += 1) {
    const kind = index % 2 === 0 ? RUN_KIND.BACKTEST : RUN_KIND.WALK_FORWARD;
    const run = await runs.createRun(owner.scope, buildRunParams(version.id, { kind }));
    created.push(run?.id ?? '');
  }
  const sameMillisecond = created.slice(0, 6);
  for (const [index, runId] of sameMillisecond.entries()) {
    await client`UPDATE runs SET created_at = ${`2026-01-01 10:00:00.1230${index}1+00`}::timestamptz WHERE id = ${runId}`;
  }
  await seedRun(handle, other);
  const seen: string[] = [];
  let after: RunCursor | undefined;
  for (let pages = 0; pages < PAGED_RUNS; pages += 1) {
    const page = await runs.listRuns(owner.scope, { limit: PAGE_SIZE, after, kind: undefined });
    seen.push(...page.runs.map((run) => run.id));
    after = page.nextCursor;
    if (after === undefined) break;
  }
  assertCondition(
    seen.length === PAGED_RUNS && new Set(seen).size === PAGED_RUNS,
    `paginação deve trazer cada execução uma vez: ${seen.length}/${new Set(seen).size}`,
  );
  assertCondition(
    created.every((runId) => seen.includes(runId)),
    'nenhuma execução pulada',
  );
  const sameTail = seen.slice(-sameMillisecond.length);
  assertCondition(
    sameMillisecond.every((runId) => sameTail.includes(runId)),
    'execuções no mesmo milissegundo não se repetem nem somem entre páginas',
  );
  const walkForwards = await runs.listRuns(owner.scope, {
    limit: 100,
    after: undefined,
    kind: RUN_KIND.WALK_FORWARD,
  });
  assertCondition(
    walkForwards.runs.length === 11 &&
      walkForwards.runs.every((run) => run.kind === RUN_KIND.WALK_FORWARD),
    'filtro por tipo',
  );
  reportCheck(
    `listagem: ${PAGED_RUNS} execuções em páginas de ${PAGE_SIZE} sem repetir nem pular (cursor com microssegundos, 6 no mesmo milissegundo)`,
  );
}

async function checkOrphans(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-run-orphans');
  const runs = createRunRepository(handle);
  const running = async (kind: (typeof RUN_KIND)[keyof typeof RUN_KIND]): Promise<string> => {
    const run = await seedRun(handle, owner, { kind });
    await runs.transitionRun(owner.scope, { runId: run.id, to: RUN_STATUS.RUNNING });
    return run.id;
  };
  const backtest = await running(RUN_KIND.BACKTEST);
  const walkForward = await running(RUN_KIND.WALK_FORWARD);
  const livePaper = await running(RUN_KIND.LIVE_PAPER);
  const queued = (await seedRun(handle, owner)).id;
  const failed = await runs.failOrphanedRuns({
    kinds: [RUN_KIND.BACKTEST, RUN_KIND.WALK_FORWARD],
    errorCode: ORPHAN_ERROR_CODE,
  });
  const statusOf = async (runId: string): Promise<string | undefined> =>
    (await runs.findRun(owner.scope, runId))?.status;
  assertCondition(failed >= 2, `órfãs marcadas: ${failed}`);
  assertCondition((await statusOf(backtest)) === RUN_STATUS.FAILED, 'backtest órfão -> failed');
  assertCondition(
    (await statusOf(walkForward)) === RUN_STATUS.FAILED,
    'walk-forward órfão -> failed',
  );
  assertCondition((await statusOf(livePaper)) === RUN_STATUS.RUNNING, 'simulação ao vivo continua');
  assertCondition((await statusOf(queued)) === RUN_STATUS.QUEUED, 'queued não é órfã');
  const orphan = await runs.findRun(owner.scope, backtest);
  assertCondition(
    orphan?.errorCode === ORPHAN_ERROR_CODE && orphan.finishedAt !== undefined,
    'órfã guarda o código e finished_at',
  );
  reportCheck(
    'órfãs do boot: backtest e walk-forward running viram failed; ao vivo e queued ficam',
  );
}

async function checkLineageAndConstraints(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-run-owner');
  const other = await resolvePersistenceOwner(handle, 'subject-run-other');
  const runs = createRunRepository(handle);
  const original = await seedRun(handle, owner);
  const replica = await runs.createRun(
    owner.scope,
    buildRunParams(original.strategyVersionId, { migratedFromRunId: original.id }),
  );
  assertCondition(replica?.migratedFromRunId === original.id, 'migração liga à execução anterior');
  const alien = await seedRun(handle, other);
  const refused = await runs.createRun(
    owner.scope,
    buildRunParams(original.strategyVersionId, { migratedFromRunId: alien.id }),
  );
  assertCondition(refused === undefined, 'migrated_from de outro dono -> não encontrado');
  const foreignKey = await captureErrorCode(
    client`UPDATE runs SET migrated_from_run_id = ${alien.id} WHERE id = ${original.id}`,
  );
  assertCondition(
    foreignKey === FOREIGN_KEY_VIOLATION,
    `FK composta migrated_from: ${String(foreignKey)}`,
  );
  const inconsistent = await captureErrorCode(
    client`UPDATE runs SET status = 'completed' WHERE id = ${original.id}`,
  );
  assertCondition(
    inconsistent === CHECK_VIOLATION,
    `final sem finished_at: ${String(inconsistent)}`,
  );
  const badKind = await captureErrorCode(
    client`UPDATE runs SET kind = 'other' WHERE id = ${original.id}`,
  );
  assertCondition(badKind === CHECK_VIOLATION, `kind fora do vocabulário: ${String(badKind)}`);
  const strategies = createStrategyRepository(handle);
  assertCondition((await strategies.listStrategies(owner.scope)).length > 0, 'estratégias do dono');
  reportCheck('execução: migrated_from em FK composta; CHECKs de estado final e de tipo');
}

export async function checkRunRepository(context: LifecycleCheckContext): Promise<void> {
  await checkCreateAndTransitions(context);
  await checkRequest(context);
  await checkCheckpoint(context);
  await checkListing(context);
  await checkLineageAndConstraints(context);
  await checkOrphans(context);
}
