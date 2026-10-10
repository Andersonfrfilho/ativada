// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { RUN_QUEUE_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 600_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const DISPATCHER = 'runs/queue/run-queue-dispatcher.ts';
const ADMISSION = 'runs/run-admission.ts';

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const MUTANTS: readonly SourceMutant[] = [
  {
    name: 'HEARTBEAT_NEVER_RENEWED',
    edits: edit(DISPATCHER, 'if (runIds.length === 0) return;', 'return;'),
  },
  {
    name: 'LOST_CLAIM_NOT_REPORTED',
    edits: edit(DISPATCHER, 'if (lost.length > 0)', 'if (false as boolean)'),
  },
  {
    name: 'ORPHANS_NEVER_RECLAIMED',
    edits: edit(DISPATCHER, 'queue.reclaimExpiredRuns({', 'Promise.resolve({'),
  },
  {
    name: 'INACTIVE_ACCOUNTS_NEVER_CANCELLED',
    edits: edit(DISPATCHER, 'queue.cancelRunsOfInactiveOwners()', 'Promise.resolve(0)'),
  },
  {
    name: 'QUEUED_RUNS_NOT_REDISPATCHED_AT_BOOT',
    edits: edit(
      DISPATCHER,
      '    await this.maintain();\n  }\n\n  async stop()',
      '  }\n\n  async stop()',
    ),
  },
  {
    name: 'GLOBAL_CONCURRENCY_IGNORED',
    edits: edit(
      DISPATCHER,
      '!this.isStopping && this.active.size < this.dependencies.config.globalConcurrency',
      '!this.isStopping',
    ),
  },
  {
    name: 'FINISHED_RUN_KEEPS_ITS_SLOT',
    edits: edit(DISPATCHER, '      this.active.delete(claimed.runId);\n', ''),
  },
  {
    name: 'SHUTDOWN_LEAVES_THE_RUNS_RUNNING',
    edits: edit(
      DISPATCHER,
      'return queue.releaseClaimedRuns({ claimedBy: config.instanceId });',
      'return Promise.resolve(0);',
    ),
  },
  {
    name: 'SHUTDOWN_WAITS_FOREVER_FOR_THE_RELEASE',
    edits: edit(
      DISPATCHER,
      'this.withinShutdownTimeout(this.releaseClaimedRuns())',
      'this.releaseClaimedRuns()',
    ),
  },
  {
    name: 'SHUTDOWN_WAITS_FOREVER_FOR_A_CLAIM_IN_FLIGHT',
    edits: edit(
      DISPATCHER,
      'this.withinShutdownTimeout(this.pumpInFlight ?? Promise.resolve())',
      '(this.pumpInFlight ?? Promise.resolve())',
    ),
  },
  {
    name: 'SHUTDOWN_DOES_NOT_AWAIT_A_CLAIM_IN_FLIGHT',
    edits: edit(
      DISPATCHER,
      'this.withinShutdownTimeout(this.pumpInFlight ?? Promise.resolve())',
      'Promise.resolve()',
    ),
  },
  {
    name: 'SHUTDOWN_LAUNCHES_THE_CLAIM_IN_FLIGHT',
    edits: edit(
      DISPATCHER,
      'if (claimed === undefined || this.isStopping) return;',
      'if (claimed === undefined) return;',
    ),
  },
  {
    name: 'TIMER_REENTERS_SLOW_CYCLES',
    edits: edit('runs/queue/interval-timers.ts', '        if (isRunning) return;\n', ''),
  },
  {
    name: 'LOST_CLAIM_WITHOUT_THE_RUN_ID',
    edits: edit(DISPATCHER, "`${CLAIM_LOST_MESSAGE} ${lost.join(', ')}`", 'CLAIM_LOST_MESSAGE'),
  },
  {
    name: 'SHUTDOWN_KEEPS_CLAIMING',
    edits: edit(DISPATCHER, '    this.isStopping = true;\n', ''),
  },
  {
    name: 'CRASH_SIMULATION_TOUCHES_THE_QUEUE',
    edits: edit(
      DISPATCHER,
      '  async abandon(): Promise<void> {\n    this.haltLocally();\n    await this.endExecutions();\n',
      '  async abandon(): Promise<void> {\n    this.haltLocally();\n    await this.endExecutions();\n    await this.dependencies.queue.releaseClaimedRuns({ claimedBy: this.dependencies.config.instanceId });\n',
    ),
  },
  {
    name: 'WALK_FORWARD_SENT_TO_THE_BACKTEST_THREAD',
    edits: edit(
      'runs/queue/create-application-dispatcher.ts',
      '[RUN_KIND.WALK_FORWARD]: (runId) => runners.walkForwardRunner.run(runId),',
      '[RUN_KIND.WALK_FORWARD]: (runId) => runners.backtestRunner.run(runId),',
    ),
  },
  {
    name: 'ENVIRONMENT_CONCURRENCY_IGNORED',
    edits: edit(
      'runs/queue/create-application-dispatcher.ts',
      'globalConcurrency: environment.RUN_GLOBAL_CONCURRENCY,',
      'globalConcurrency: 1,',
    ),
  },
  {
    name: 'SHUTDOWN_TERMINATES_ONLY_THE_BACKTESTS',
    edits: edit(
      'runs/queue/create-application-dispatcher.ts',
      '        runners.walkForwardRunner.terminateAll(),\n',
      '',
    ),
  },
  {
    name: 'QUEUE_LIMIT_NOT_ENFORCED',
    edits: edit(
      ADMISSION,
      'if (queued >= dependencies.queuePerUserLimit) throw new RunQueueFullError();',
      '',
    ),
  },
  {
    name: 'QUEUE_LIMIT_OFF_BY_ONE',
    edits: edit(
      ADMISSION,
      'queued >= dependencies.queuePerUserLimit',
      'queued > dependencies.queuePerUserLimit',
    ),
  },
  {
    name: 'LIVE_LIMIT_NOT_ENFORCED',
    edits: edit(
      ADMISSION,
      'if (active >= limits.maxActiveLivePaperRuns) throw new LiveRunLimitReachedError();',
      '',
    ),
  },
  {
    name: 'LIVE_LIMIT_IGNORES_THE_USER_LIMITS',
    edits: edit(ADMISSION, 'active >= limits.maxActiveLivePaperRuns', 'active >= 5'),
  },
  {
    name: 'RUN_CREATED_WITHOUT_ADMISSION',
    edits: edit(
      'runs/create-run.use-case.ts',
      '    await admitRun(dependencies, { scope, kind: body.kind });\n',
      '',
    ),
  },
  {
    name: 'QUEUE_POSITION_NOT_RETURNED',
    edits: edit(
      'runs/run.use-cases.ts',
      'queuePosition: await readQueuePosition(dependencies, scope, run),',
      'queuePosition: null,',
    ),
  },
  {
    name: 'QUEUE_POSITION_MISSING_FROM_THE_CREATION',
    edits: edit(
      'runs/create-run.use-case.ts',
      'read: () => readQueuePosition(dependencies, scope, run),',
      'read: () => Promise.resolve(null),',
    ),
  },
  {
    name: 'CREATION_FAILS_WHEN_THE_EXTRAS_FAIL',
    edits: edit(
      'runs/create-run.use-case.ts',
      '    dependencies.reportUnexpectedError(error);\n    return params.fallback;',
      '    throw error;',
    ),
  },
  {
    name: 'EXTRAS_FAILURE_NOT_REPORTED',
    edits: edit(
      'runs/create-run.use-case.ts',
      '    dependencies.reportUnexpectedError(error);\n',
      '',
    ),
  },
];

describe('fila de execuções: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(RUN_QUEUE_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(RUN_QUEUE_MUTANT_TARGET));

  test('a cópia sem edição passa nos mesmos testes: o arnês é sólido', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });

  test('os nomes são distintos', () => {
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });
});
