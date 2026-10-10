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
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
} from '@cryptoada/strategy-engine';

import { parseJsonContainer } from '@cryptoada/run-recording';
import { StrategyVersionNotFoundError } from '../strategies/strategy.error.js';
import { checkWalkForwardRequest } from './check-walk-forward-request.js';
import type { CreateRunBody } from './create-run-request.schema.js';
import { admitRun, type RunAdmissionDependencies } from './run-admission.js';
import type { RunDispatcher } from './run-dispatcher.js';
import { readQueuePosition, type RunQueuePositionDependencies } from './run-queue-position.js';
import { describeRunSurvival } from './run-survival.js';
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

// O pedido guardado na linha: a grade e as janelas do walk-forward, ou a configuração do piso/dobro da simulação ao vivo.
function toRequest(body: CreateRunBody): CreateRunParams['request'] {
  if (body.walkForward !== undefined) return parseJsonContainer(JSON.stringify(body.walkForward));
  if (body.survival === undefined) return undefined;
  return parseJsonContainer(JSON.stringify({ survival: body.survival }));
}

function toCreateParams(body: CreateRunBody, now: number): CreateRunParams {
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
    periodStart: resolvePeriodStart(body, now),
    periodEnd: body.periodEnd,
    migratedFromRunId: undefined,
    // O pedido do walk-forward (grade e janelas) mora na linha: a thread o lê de lá (migration 0010).
    request: toRequest(body),
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

export function createCreateRunUseCase(dependencies: CreateRunDependencies): CreateRunUseCase {
  return async (scope, body) => {
    const version = await dependencies.strategies.findVersion(scope, body.strategyVersionId);
    if (version === undefined) throw new StrategyVersionNotFoundError();
    await admitRun(dependencies, { scope, kind: body.kind });
    assertWalkForward(dependencies, body, version.config);
    const created = await dependencies.runs.createRun(
      scope,
      toCreateParams(body, dependencies.now()),
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
    return { ...toRunView(run), warnings, queuePosition, survival: describeRunSurvival(run, []) };
  };
}
