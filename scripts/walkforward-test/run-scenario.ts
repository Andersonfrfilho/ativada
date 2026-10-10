// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalkForwardThreadOutcome } from '../../apps/api-cryptoada/src/walk-forward/walk-forward-thread-outcome.js';
import { readPersisted, type PersistedWalkForward } from './read-persisted.js';
import {
  assertCondition,
  createTestRunner,
  newRun,
  type RunnerOptions,
  type Scenario,
  type WalkForwardTestContext,
} from './walkforward-test-context.js';

export type ScenarioResult = {
  readonly runId: string;
  readonly outcome: WalkForwardThreadOutcome;
  readonly persisted: PersistedWalkForward;
  readonly wallMilliseconds: number;
};

// Cria a execução, roda na thread de produção e lê de volta o que ficou gravado.
export async function runScenario(
  context: WalkForwardTestContext,
  scenario: Scenario,
  options: RunnerOptions = {},
): Promise<ScenarioResult> {
  const run = await newRun(context, scenario);
  const runner = createTestRunner(context, options);
  const startedAt = performance.now();
  const outcome = await runner.run(run.id);
  const wallMilliseconds = performance.now() - startedAt;
  return {
    runId: run.id,
    outcome,
    persisted: await readPersisted(context, run.id),
    wallMilliseconds,
  };
}

export function assertCompleted(result: ScenarioResult, label: string): void {
  assertCondition(
    result.outcome.status === 'completed' &&
      result.persisted.status === 'completed' &&
      result.persisted.progress === 100,
    `${label}: terminou ${result.outcome.status} / ${result.persisted.status} (${String(result.persisted.errorCode)})`,
  );
}
