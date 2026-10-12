// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readErrorName } from '@ativada/environment';
import type { Engine } from '@ativada/strategy-engine';

import { LIVE_LOG, LIVE_PASS_KIND } from './live.constant.js';
import {
  describeLiveFailure,
  isEndedByAccountDeletion,
  isTransientFailure,
} from './describe-live-failure.js';
import type {
  LiveEvaluatorDependencies,
  LivePassOutcome,
  LiveRunSession,
} from './live-run.types.js';
import { runLivePass } from './live-pass.js';

export type EvaluateLiveRunParams = {
  readonly dependencies: LiveEvaluatorDependencies;
  readonly engine: Engine;
  readonly maxSteps: number;
  readonly runId: string;
};

async function recordFailure(
  session: LiveRunSession | undefined,
  errorCode: string,
): Promise<void> {
  try {
    await session?.failRun(errorCode);
  } catch {
    // Sem como gravar a falha agora: a execução segue `running` e a próxima ronda repete o diagnóstico.
  }
}

async function settle(
  params: EvaluateLiveRunParams,
  session: LiveRunSession | undefined,
  error: unknown,
): Promise<LivePassOutcome> {
  const { logger } = params.dependencies;
  const { runId } = params;
  if (isEndedByAccountDeletion(error)) {
    logger.info(LIVE_LOG.RUN_ENDED, { runId });
    return { kind: LIVE_PASS_KIND.ENDED, steps: 0 };
  }
  if (isTransientFailure(error)) {
    logger.warn(LIVE_LOG.RUN_RETRY, { runId });
    return { kind: LIVE_PASS_KIND.IDLE, steps: 0 };
  }
  const errorCode = describeLiveFailure(error);
  await recordFailure(session, errorCode);
  logger.error(LIVE_LOG.RUN_FAILED, { runId, errorCode, errorName: readErrorName(error) });
  return { kind: LIVE_PASS_KIND.FAILED, steps: 0 };
}

// Uma ronda de uma simulação que NUNCA lança: o que dá errado vira desfecho (encerrada, tentar de novo, falha tipada),
// para que uma execução quebrada não derrube as demais da mesma ronda.
export async function evaluateLiveRun(params: EvaluateLiveRunParams): Promise<LivePassOutcome> {
  const { dependencies, engine, maxSteps, runId } = params;
  let session: LiveRunSession | undefined;
  try {
    session = await dependencies.database.attach(runId);
    if (session === undefined) {
      dependencies.logger.info(LIVE_LOG.RUN_ENDED, { runId });
      return { kind: LIVE_PASS_KIND.ENDED, steps: 0 };
    }
    const outcome = await runLivePass({
      session,
      engine,
      maxSteps,
      isGapConfirmed: dependencies.isGapConfirmed,
      alerting: dependencies.alerting,
      gapPolicy: dependencies.gapPolicy,
    });
    if (outcome.kind === LIVE_PASS_KIND.WAITING) {
      dependencies.logger.info(LIVE_LOG.RUN_WAITING_FOR_GAP, { runId });
    }
    if (outcome.kind === LIVE_PASS_KIND.ENDED)
      dependencies.logger.info(LIVE_LOG.RUN_ENDED, { runId });
    return outcome;
  } catch (error: unknown) {
    return settle(params, session, error);
  }
}
