// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND } from '@ativada/database';
import { MILLISECONDS_PER_SECOND } from '@ativada/environment';

import type { Environment } from '../../environment.js';
import type { ApplicationRunners } from '../create-application-runners.js';
import { createIntervalTimers } from './interval-timers.js';
import { createRunQueueDispatcher } from './run-queue-dispatcher.js';
import type { RunQueueDispatcher, RunQueuePort } from './run-queue-dispatcher.types.js';

// A ronda que pega o que outra instância enfileirou e recupera as órfãs: barata (índices parciais) e não precisa de env.
const QUEUE_POLL_MILLISECONDS = 2_000;
const QUEUE_RELEASE_TIMEOUT_MILLISECONDS = 2_000;

export type ApplicationDispatcherParams = {
  readonly environment: Pick<
    Environment,
    | 'RUN_GLOBAL_CONCURRENCY'
    | 'RUN_HEARTBEAT_INTERVAL_SECONDS'
    | 'RUN_HEARTBEAT_TIMEOUT_SECONDS'
    | 'RUN_ORPHAN_POLICY'
  >;
  readonly queue: RunQueuePort;
  readonly runners: Pick<ApplicationRunners, 'backtestRunner' | 'walkForwardRunner'>;
  readonly reportUnexpectedError: (error: unknown) => void;
};

// O despachante da FILA com os executores reais e a configuração do ambiente (ADR 0002, T3.6).
export function createApplicationDispatcher(
  params: ApplicationDispatcherParams,
): RunQueueDispatcher {
  const { environment, runners } = params;
  return createRunQueueDispatcher({
    queue: params.queue,
    executors: {
      [RUN_KIND.BACKTEST]: (runId) => runners.backtestRunner.run(runId),
      [RUN_KIND.WALK_FORWARD]: (runId) => runners.walkForwardRunner.run(runId),
    },
    terminateExecutors: async () => {
      await Promise.all([
        runners.backtestRunner.terminateAll(),
        runners.walkForwardRunner.terminateAll(),
      ]);
    },
    timers: createIntervalTimers(),
    config: {
      instanceId: crypto.randomUUID(),
      globalConcurrency: environment.RUN_GLOBAL_CONCURRENCY,
      heartbeatIntervalMilliseconds:
        environment.RUN_HEARTBEAT_INTERVAL_SECONDS * MILLISECONDS_PER_SECOND,
      heartbeatTimeoutSeconds: environment.RUN_HEARTBEAT_TIMEOUT_SECONDS,
      pollIntervalMilliseconds: QUEUE_POLL_MILLISECONDS,
      releaseTimeoutMilliseconds: QUEUE_RELEASE_TIMEOUT_MILLISECONDS,
      orphanPolicy: environment.RUN_ORPHAN_POLICY,
    },
    reportUnexpectedError: params.reportUnexpectedError,
  });
}
