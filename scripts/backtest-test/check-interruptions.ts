// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunRepository,
  RUN_KIND,
  RUN_STATUS,
  type RunRecord,
} from '../../packages/database/src/index.js';
import {
  ORPHANED_AT_BOOT,
  CANCEL_AT_PROGRESS,
  REPAIR_BUDGET_MILLISECONDS,
  SHORT_TIMEOUT_MILLISECONDS,
} from './backtest-test.constant.js';
import {
  assertCondition,
  createBacktestRun,
  createTestRunner,
  reportLine,
  type BacktestTestContext,
} from './backtest-test-context.js';
import { SYMBOL, TIMEFRAME, type SyntheticWindow } from './check-two-years.js';
import { readPersistedRun } from './read-run-rows.js';

const CRASHING_WORKER_URL = new URL('./crashing.worker.ts', import.meta.url).href;

async function newRun(context: BacktestTestContext, window: SyntheticWindow): Promise<RunRecord> {
  return createBacktestRun(context, { symbol: SYMBOL, timeframe: TIMEFRAME, ...window });
}

export async function checkCancellation(
  context: BacktestTestContext,
  window: SyntheticWindow,
): Promise<void> {
  const run = await newRun(context, window);
  const runs = createRunRepository(context.handle);
  let isCancelRequested = false;
  const runner = createTestRunner(context, {
    onProgress: (progress) => {
      if (isCancelRequested || progress < CANCEL_AT_PROGRESS) return;
      isCancelRequested = true;
      void runs.transitionRun(context.owner.scope, { runId: run.id, to: RUN_STATUS.CANCELLED });
    },
  });
  const outcome = await runner.run(run.id);
  assertCondition(outcome.status === 'cancelled', `cancelamento terminou ${outcome.status}`);
  const stored = await readPersistedRun(context, run.id);
  assertCondition(
    stored.status === 'cancelled' && stored.errorCode === undefined,
    'cancelada deve ficar cancelled, sem erro',
  );
  assertCondition(
    (stored.counts['equityPoints'] ?? 0) > 0,
    'o cancelamento apagou o que já tinha sido gravado',
  );
  assertCondition(
    stored.metrics === undefined || stored.metrics === null,
    'cancelada não grava métricas',
  );
  const lastPoint = stored.rows.equityPoints.at(-1) as { candleTime: number } | undefined;
  assertCondition(
    lastPoint?.candleTime === stored.lastCandleTime,
    'o checkpoint não acompanha o último lote gravado',
  );
  reportLine(
    `CANCELAMENTO: parou no meio sem erro, status cancelled, ${stored.counts['equityPoints']} pontos mantidos (último lote íntegro, checkpoint no mesmo candle), sem métricas`,
  );
}

async function expectFailure(params: {
  readonly context: BacktestTestContext;
  readonly run: RunRecord;
  readonly errorCode: string;
  readonly label: string;
}): Promise<void> {
  const { context, run } = params;
  const outcome = await createTestRunner(context).run(run.id);
  assertCondition(
    outcome.status === 'failed' && outcome.errorCode === params.errorCode,
    `${params.label}: esperado failed ${params.errorCode}, obtido ${JSON.stringify(outcome)}`,
  );
  const stored = await readPersistedRun(context, run.id);
  assertCondition(
    stored.status === 'failed' && stored.errorCode === params.errorCode,
    `${params.label}: não ficou failed/${params.errorCode}`,
  );
  assertCondition(
    (stored.counts['equityPoints'] ?? 0) === 0,
    `${params.label}: gravou resultado antes de falhar`,
  );
}

export async function checkTypedFailures(
  context: BacktestTestContext,
  window: SyntheticWindow,
): Promise<void> {
  const tampered = await newRun(context, window);
  await context.client`UPDATE runs SET run_hash = ${'f'.repeat(64)} WHERE id = ${tampered.id}`;
  await expectFailure({
    context,
    run: tampered,
    errorCode: 'HASH_MISMATCH',
    label: 'hash adulterado',
  });
  const empty = await createBacktestRun(context, {
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    periodStart: 1_000,
    periodEnd: 2_000_000,
  });
  await expectFailure({
    context,
    run: empty,
    errorCode: 'NO_CANDLES',
    label: 'período sem candles',
  });
  const firstCandle = window.periodStart - 194 * 3_600_000;
  const shortHistory = await createBacktestRun(context, {
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    periodStart: firstCandle + 50 * 3_600_000,
    periodEnd: firstCandle + 400 * 3_600_000,
  });
  await expectFailure({
    context,
    run: shortHistory,
    errorCode: 'INSUFFICIENT_HISTORY',
    label: 'histórico curto',
  });
  reportLine(
    'FALHAS TIPADAS: hash adulterado (HASH_MISMATCH), período sem candles (NO_CANDLES) e aquecimento curto (INSUFFICIENT_HISTORY) viram failed com código estável e nada gravado',
  );
}

async function crashRun(params: {
  readonly context: BacktestTestContext;
  readonly window: SyntheticWindow;
  readonly mode: 'exit' | 'throw' | 'hang';
  readonly shouldRecord: boolean;
}): Promise<{
  run: RunRecord;
  wallMilliseconds: number;
  outcome: Awaited<ReturnType<ReturnType<typeof createTestRunner>['run']>>;
}> {
  const { context } = params;
  const run = await newRun(context, params.window);
  const runner = createTestRunner(context, {
    workerUrl: CRASHING_WORKER_URL,
    extraEnvironment: { CRASH_MODE: params.mode },
    shouldRecordFailures: params.shouldRecord,
    timeoutMilliseconds: SHORT_TIMEOUT_MILLISECONDS,
  });
  const startedAt = performance.now();
  const outcome = await runner.run(run.id);
  return { run, wallMilliseconds: performance.now() - startedAt, outcome };
}

export async function checkDyingThreads(
  context: BacktestTestContext,
  window: SyntheticWindow,
): Promise<void> {
  for (const mode of ['exit', 'throw'] as const) {
    const { run, outcome } = await crashRun({ context, window, mode, shouldRecord: true });
    assertCondition(
      outcome.status === 'failed' && outcome.errorCode === 'WORKER_CRASHED' && outcome.isRecorded,
      `thread que morre (${mode}): ${JSON.stringify(outcome)}`,
    );
    const stored = await readPersistedRun(context, run.id);
    assertCondition(
      stored.status === 'failed' && stored.errorCode === 'WORKER_CRASHED',
      `thread que morre (${mode}): execução não ficou failed/WORKER_CRASHED`,
    );
    assertCondition(
      (stored.counts['equityPoints'] ?? 0) > 0,
      `thread que morre (${mode}): o que já estava gravado foi apagado`,
    );
  }
  const hung = await crashRun({ context, window, mode: 'hang', shouldRecord: true });
  assertCondition(
    hung.outcome.status === 'failed' &&
      hung.outcome.errorCode === 'BACKTEST_TIMEOUT' &&
      hung.outcome.isRecorded,
    `timeout: ${JSON.stringify(hung.outcome)}`,
  );
  const stored = await readPersistedRun(context, hung.run.id);
  assertCondition(
    stored.status === 'failed' && stored.errorCode === 'BACKTEST_TIMEOUT',
    'timeout: execução não ficou failed/BACKTEST_TIMEOUT',
  );
  reportLine(
    'THREAD QUE MORRE: process.exit e exceção não capturada => failed/WORKER_CRASHED; thread travada => terminada no timeout e failed/BACKTEST_TIMEOUT; o que os lotes já gravaram fica',
  );
}

export async function checkOrphans(
  context: BacktestTestContext,
  window: SyntheticWindow,
  referenceDigest: string,
): Promise<void> {
  const runs = createRunRepository(context.handle);
  const toRecover = await crashRun({ context, window, mode: 'exit', shouldRecord: false });
  assertCondition(
    toRecover.outcome.status === 'failed' && !toRecover.outcome.isRecorded,
    'a queda sem registro deve ficar sem registro',
  );
  const orphan = await runs.findRun(context.owner.scope, toRecover.run.id);
  assertCondition(orphan?.status === RUN_STATUS.RUNNING, 'a órfã deveria continuar running');
  const checkpoint = await runs.readCheckpoint(context.owner.scope, toRecover.run.id);
  assertCondition(
    checkpoint?.engineState !== undefined && (checkpoint.lastCandleTime ?? 0) > 0,
    'a órfã deveria ter checkpoint',
  );
  const startedAt = performance.now();
  const resumed = await createTestRunner(context).run(toRecover.run.id);
  assertCondition(resumed.status === 'completed', `retomada terminou ${resumed.status}`);
  const finished = await readPersistedRun(context, toRecover.run.id);
  assertCondition(
    finished.digest === referenceDigest,
    'RETOMADA: o resultado difere da execução contínua',
  );
  reportLine(
    `RETOMADA: a órfã running (checkpoint em ${checkpoint?.lastCandleTime}) retomou do banco em ${(performance.now() - startedAt).toFixed(0)} ms e o resultado é IDÊNTICO ao da execução contínua (digest ${finished.digest})`,
  );
  const second = await crashRun({ context, window, mode: 'exit', shouldRecord: false });
  const failedAtBoot = await runs.failOrphanedRuns({
    kinds: [RUN_KIND.BACKTEST, RUN_KIND.WALK_FORWARD],
    errorCode: ORPHANED_AT_BOOT,
  });
  const marked = await runs.findRun(context.owner.scope, second.run.id);
  assertCondition(
    failedAtBoot === 1 &&
      marked?.status === RUN_STATUS.FAILED &&
      marked.errorCode === ORPHANED_AT_BOOT,
    'a órfã não foi recuperada pelo failOrphanedRuns do boot (T3.6)',
  );
  assertCondition(second.wallMilliseconds < REPAIR_BUDGET_MILLISECONDS, 'a queda demorou demais');
  reportLine(
    'ÓRFÃ: a execução running deixada por uma queda continua recuperável pela T3.6 (failOrphanedRuns a marca failed; ou a retomada a conclui)',
  );
}
