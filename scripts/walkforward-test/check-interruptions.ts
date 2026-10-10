// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createRunRepository, RUN_STATUS } from '../../packages/database/src/index.js';
import { GRID_24, hourlyScenario, NO_COSTS } from './scenarios.js';
import { readPersisted } from './read-persisted.js';
import { assertCompleted, type ScenarioResult } from './run-scenario.js';
import {
  CANCEL_AT_PROGRESS,
  RESUME_KILL_AT_PROGRESS,
  SYMBOLS,
} from './walkforward-test.constant.js';
import {
  assertCondition,
  createTestRunner,
  newRun,
  reportLine,
  type Scenario,
  type WalkForwardTestContext,
} from './walkforward-test-context.js';

const REQUEST = { grid: GRID_24, minTradesPerWindow: 10 } as const;
const SETTLE_MILLISECONDS = 800;

function scenarioOf(versionId: string): Scenario {
  return hourlyScenario({
    versionId,
    symbol: SYMBOLS.OVERFITTING,
    request: REQUEST,
    costs: NO_COSTS,
  });
}

// (f) Cancelamento: o usuário cancela com o walk-forward na busca e depois no teste; a thread para entre as
// unidades, nada é apagado e a execução fica `cancelled`, sem erro e sem métricas.
export async function checkCancellation(
  context: WalkForwardTestContext,
  versionId: string,
): Promise<void> {
  const runs = createRunRepository(context.handle);
  for (const [label, atProgress] of [
    ['na busca', CANCEL_AT_PROGRESS],
    ['no teste das janelas', RESUME_KILL_AT_PROGRESS],
  ] as const) {
    const run = await newRun(context, scenarioOf(versionId));
    let isCancelRequested = false;
    const runner = createTestRunner(context, {
      threads: 2,
      onProgress: (progress) => {
        if (isCancelRequested || progress < atProgress) return;
        isCancelRequested = true;
        void runs.transitionRun(context.owner.scope, { runId: run.id, to: RUN_STATUS.CANCELLED });
      },
    });
    const outcome = await runner.run(run.id, REQUEST);
    assertCondition(
      outcome.status === 'cancelled',
      `cancelamento ${label} terminou ${outcome.status}`,
    );
    const stored = await readPersisted(context, run.id);
    assertCondition(
      stored.status === 'cancelled' && stored.errorCode === undefined,
      'cancelada deve ficar cancelled, sem erro',
    );
    assertCondition(
      stored.metrics === null || stored.metrics === undefined,
      'cancelada não grava métricas',
    );
    await Bun.sleep(SETTLE_MILLISECONDS);
    const later = await readPersisted(context, run.id);
    assertCondition(
      later.digest === stored.digest,
      `cancelamento ${label}: a execução continuou gravando depois de cancelada`,
    );
    reportLine(
      `CANCELAMENTO ${label}: a thread parou entre as unidades (${stored.counts['windows']} janelas gravadas, progresso ${stored.progress}), status cancelled, sem erro nem métricas, nada gravado depois`,
    );
  }
}

// (e) Retomada: o processo cai (a thread é terminada, a execução fica `running`) na busca e no teste; a nova thread
// continua do checkpoint e o resultado final é IDÊNTICO ao da execução sem queda.
export async function checkResume(
  context: WalkForwardTestContext,
  versionId: string,
  reference: ScenarioResult,
): Promise<void> {
  for (const [label, killAt] of [
    ['no meio da busca', 50],
    ['no meio do teste das janelas', RESUME_KILL_AT_PROGRESS + 1],
  ] as const) {
    const run = await newRun(context, scenarioOf(versionId));
    let isKilled = false;
    const doomed = createTestRunner(context, {
      threads: 2,
      onProgress: (progress) => {
        if (isKilled || progress < killAt) return;
        isKilled = true;
        void doomed.terminateAll();
      },
    });
    const first = await doomed.run(run.id, REQUEST);
    assertCondition(first.status === 'terminated', `queda ${label}: terminou ${first.status}`);
    const orphan = await readPersisted(context, run.id);
    assertCondition(orphan.status === 'running', `queda ${label}: ficou ${orphan.status}`);
    const stored = orphan.counts['windows'] ?? 0;
    const startedAt = performance.now();
    const outcome = await createTestRunner(context, { threads: 2 }).run(run.id, REQUEST);
    const resumeMilliseconds = performance.now() - startedAt;
    assertCondition(
      outcome.status === 'completed',
      `retomada ${label}: terminou ${outcome.status}`,
    );
    const finished = await readPersisted(context, run.id);
    assertCondition(finished.status === 'completed', 'a retomada não concluiu');
    assertCondition(
      finished.digest === reference.persisted.digest,
      `RETOMADA ${label}: o digest ${finished.digest} difere do da execução sem queda ${reference.persisted.digest}`,
    );
    reportLine(
      `RETOMADA ${label}: a órfã \`running\` (${stored} janelas já gravadas, progresso ${orphan.progress}) continuou do checkpoint em ${resumeMilliseconds.toFixed(0)} ms (sem queda: ${reference.wallMilliseconds.toFixed(0)} ms) e o digest ${finished.digest} é idêntico ao da execução sem queda`,
    );
  }
  assertCompleted(reference, 'referência');
}
