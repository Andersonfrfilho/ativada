// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  RUN_STATUS,
  RUN_TRANSITION_OUTCOME,
  type CreateRunParams,
  type GoalRecord,
  type GoalRepository,
  type OwnerScope,
  type RunRecord,
  type RunRepository,
  type StrategyRepository,
} from '@ativada/database';
import {
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
} from '@ativada/strategy-engine';

import { parseJsonContainer } from '@ativada/run-recording';
import { GoalInactiveError, GoalNotFoundError } from '../goals/goal.error.js';
import { RequestValidationError } from '../shared/http/request-validation.error.js';
import { StrategyVersionNotFoundError } from '../strategies/strategy.error.js';
import { checkWalkForwardRequest } from './check-walk-forward-request.js';
import type { CreateRunBody } from './create-run-request.schema.js';
import { admitRun, type RunAdmissionDependencies } from './run-admission.js';
import type { RunDispatcher } from './run-dispatcher.js';
import { readQueuePosition, type RunQueuePositionDependencies } from './run-queue-position.js';
import { describeRunSurvival } from './run-survival.js';
import { toRunView, type RunDetailView } from './run-view.js';
import { readRunWarnings, type RunWarningDependencies } from './run-warnings.js';
import { RUN_FIELD, RUN_REASON, RUN_STORED_ERROR_CODE } from './runs.constant.js';

export type CreateRunDependencies = RunWarningDependencies &
  RunAdmissionDependencies &
  RunQueuePositionDependencies & {
    readonly strategies: Pick<StrategyRepository, 'findVersion'>;
    readonly goals: Pick<GoalRepository, 'findGoal'>;
    readonly runs: Pick<RunRepository, 'createRun' | 'transitionRun'>;
    readonly dispatcher: RunDispatcher;
    readonly now: () => number;
    readonly reportUnexpectedError: (error: unknown) => void;
  };

export type CreateRunUseCase = (scope: OwnerScope, body: CreateRunBody) => Promise<RunDetailView>;

// A simulação ao vivo começa no candle que está aberto agora: o primeiro a ser avaliado é o que fechar a seguir, e os
// anteriores (já fechados no banco) são o aquecimento do motor.
function resolvePeriodStart(body: CreateRunBody, now: number): number {
  if (body.periodStart !== undefined) return body.periodStart;
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[body.setup.parameters.timeframe];
  return Math.floor(now / duration) * duration;
}

// O pedido guardado na linha: a grade e as janelas do walk-forward, ou a configuração do piso/dobro da simulação ao vivo e a
// fotografia da meta (alterar a meta depois não muda uma simulação em andamento).
function toRequest(body: CreateRunBody, goal: GoalRecord | undefined): CreateRunParams['request'] {
  if (body.walkForward !== undefined) return parseJsonContainer(JSON.stringify(body.walkForward));
  const request = {
    ...(body.survival === undefined ? {} : { survival: body.survival }),
    ...(goal === undefined
      ? {}
      : {
          goal: {
            targetRate: goal.targetRate,
            maxLossRate: goal.maxLossRate,
            horizonDays: goal.horizonDays,
          },
        }),
  };
  return Object.keys(request).length === 0
    ? undefined
    : parseJsonContainer(JSON.stringify(request));
}

function toCreateParams(
  body: CreateRunBody,
  context: { readonly now: number; readonly goal: GoalRecord | undefined },
): CreateRunParams {
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
    periodStart: resolvePeriodStart(body, context.now),
    periodEnd: body.periodEnd,
    migratedFromRunId: undefined,
    // O pedido do walk-forward (grade e janelas) mora na linha: a thread o lê de lá (migration 0010).
    request: toRequest(body, context.goal),
    ...(context.goal === undefined ? {} : { goalId: context.goal.id }),
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

// Avisos e posição enfeitam uma criação que já aconteceu: se a leitura falha, a execução não pode virar 500.
async function readBestEffort<TValue>(
  dependencies: CreateRunDependencies,
  params: { readonly read: () => Promise<TValue>; readonly fallback: TValue },
): Promise<TValue> {
  try {
    return await params.read();
  } catch (error: unknown) {
    dependencies.reportUnexpectedError(error);
    return params.fallback;
  }
}

function assertWalkForward(
  dependencies: CreateRunDependencies,
  body: CreateRunBody,
  config: unknown,
): void {
  if (body.walkForward === undefined) return;
  if (body.periodStart === undefined || body.periodEnd === undefined) return;
  checkWalkForwardRequest({
    config: createStrategyVersion(config).config,
    request: body.walkForward,
    timeframe: body.setup.parameters.timeframe,
    period: { start: body.periodStart, end: body.periodEnd },
    now: dependencies.now(),
  });
}

// A meta da simulação: do dono (meta alheia e inexistente são o mesmo 404), ligada, e do MESMO par da simulação.
async function resolveGoal(
  dependencies: CreateRunDependencies,
  scope: OwnerScope,
  body: CreateRunBody,
): Promise<GoalRecord | undefined> {
  if (body.goalId === undefined) return undefined;
  const goal = await dependencies.goals.findGoal(scope, body.goalId);
  if (goal === undefined) throw new GoalNotFoundError();
  if (!goal.isActive) throw new GoalInactiveError();
  if (goal.symbol !== body.setup.parameters.symbol) {
    throw new RequestValidationError([
      { field: RUN_FIELD.GOAL_ID, reason: RUN_REASON.GOAL_SYMBOL_MISMATCH },
    ]);
  }
  return goal;
}

export function createCreateRunUseCase(dependencies: CreateRunDependencies): CreateRunUseCase {
  return async (scope, body) => {
    const version = await dependencies.strategies.findVersion(scope, body.strategyVersionId);
    if (version === undefined) throw new StrategyVersionNotFoundError();
    const goal = await resolveGoal(dependencies, scope, body);
    await admitRun(dependencies, { scope, kind: body.kind });
    assertWalkForward(dependencies, body, version.config);
    const created = await dependencies.runs.createRun(
      scope,
      toCreateParams(body, { now: dependencies.now(), goal }),
    );
    if (created === undefined) throw new StrategyVersionNotFoundError();
    // A simulação ao vivo não passa pelo despachante: o worker a reivindica no banco (ADR 0002, T4.1).
    const run =
      body.kind === RUN_KIND.LIVE_PAPER
        ? created
        : await dispatchOrFail(dependencies, scope, created);
    const [warnings, queuePosition] = await Promise.all([
      readBestEffort(dependencies, {
        read: () => readRunWarnings(dependencies, run),
        fallback: [],
      }),
      readBestEffort(dependencies, {
        read: () => readQueuePosition(dependencies, scope, run),
        fallback: null,
      }),
    ]);
    return {
      ...toRunView(run),
      warnings,
      queuePosition,
      survival: describeRunSurvival(run, []),
      waitingForData: null,
    };
  };
}
