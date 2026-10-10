// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  RUN_STATUS,
  RUN_TRANSITION_OUTCOME,
  type CreateRunParams,
  type OwnerScope,
  type RunRecord,
  type RunRepository,
  type StrategyRepository,
} from '@cryptoada/database';
import {
  createStrategyVersion,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
} from '@cryptoada/strategy-engine';

import { parseJsonContainer } from '../backtest/json-container.js';
import { StrategyVersionNotFoundError } from '../strategies/strategy.error.js';
import { checkWalkForwardRequest } from './check-walk-forward-request.js';
import type { CreateRunBody } from './create-run-request.schema.js';
import { LiveRunsNotAvailableError } from './run.error.js';
import { admitRun, type RunAdmissionDependencies } from './run-admission.js';
import type { RunDispatcher } from './run-dispatcher.js';
import { readQueuePosition, type RunQueuePositionDependencies } from './run-queue-position.js';
import { toRunView, type RunDetailView } from './run-view.js';
import { readRunWarnings, type RunWarningDependencies } from './run-warnings.js';
import { RUN_STORED_ERROR_CODE } from './runs.constant.js';

export type CreateRunDependencies = RunWarningDependencies &
  RunAdmissionDependencies &
  RunQueuePositionDependencies & {
    readonly strategies: Pick<StrategyRepository, 'findVersion'>;
    readonly runs: Pick<RunRepository, 'createRun' | 'transitionRun'>;
    readonly dispatcher: RunDispatcher;
    readonly now: () => number;
  };

export type CreateRunUseCase = (scope: OwnerScope, body: CreateRunBody) => Promise<RunDetailView>;

function toCreateParams(body: CreateRunBody): CreateRunParams {
  const { parameters } = body.setup;
  return {
    strategyVersionId: body.strategyVersionId,
    kind: body.kind,
    symbol: parameters.symbol,
    timeframe: parameters.timeframe,
    runParameters: parseJsonContainer(JSON.stringify(parameters)),
    runHash: body.setup.runHash,
    engineVersion: ENGINE_VERSION,
    signalEngineVersion: SIGNAL_ENGINE_VERSION,
    metricsVersion: METRICS_VERSION,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    migratedFromRunId: undefined,
    // O pedido do walk-forward (grade e janelas) mora na linha: a thread o lê de lá (migration 0010).
    request:
      body.walkForward === undefined
        ? undefined
        : parseJsonContainer(JSON.stringify(body.walkForward)),
  };
}

// Execução que não pôde ser entregue ao executor nunca fica `queued` para sempre: vira `failed`.
async function dispatchOrFail(
  dependencies: CreateRunDependencies,
  scope: OwnerScope,
  run: RunRecord,
): Promise<RunRecord> {
  try {
    await dependencies.dispatcher.dispatch({ runId: run.id, kind: run.kind });
    return run;
  } catch {
    const failed = await dependencies.runs.transitionRun(scope, {
      runId: run.id,
      to: RUN_STATUS.FAILED,
      errorCode: RUN_STORED_ERROR_CODE.DISPATCH_FAILED,
    });
    return failed.outcome === RUN_TRANSITION_OUTCOME.TRANSITIONED ? failed.run : run;
  }
}

function assertWalkForward(
  dependencies: CreateRunDependencies,
  body: CreateRunBody,
  config: unknown,
): void {
  if (body.walkForward === undefined) return;
  checkWalkForwardRequest({
    config: createStrategyVersion(config).config,
    request: body.walkForward,
    timeframe: body.setup.parameters.timeframe,
    period: { start: body.periodStart, end: body.periodEnd },
    now: dependencies.now(),
  });
}

export function createCreateRunUseCase(dependencies: CreateRunDependencies): CreateRunUseCase {
  return async (scope, body) => {
    const version = await dependencies.strategies.findVersion(scope, body.strategyVersionId);
    if (version === undefined) throw new StrategyVersionNotFoundError();
    await admitRun(dependencies, { scope, kind: body.kind });
    if (body.kind === RUN_KIND.LIVE_PAPER) throw new LiveRunsNotAvailableError();
    assertWalkForward(dependencies, body, version.config);
    const created = await dependencies.runs.createRun(scope, toCreateParams(body));
    if (created === undefined) throw new StrategyVersionNotFoundError();
    const run = await dispatchOrFail(dependencies, scope, created);
    return {
      ...toRunView(run),
      warnings: await readRunWarnings(dependencies, run),
      queuePosition: await readQueuePosition(dependencies, scope, run),
    };
  };
}
