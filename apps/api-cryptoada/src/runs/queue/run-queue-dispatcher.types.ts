// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunKind, RunOrphanPolicy, RunQueueRepository } from '@cryptoada/database';

import type { RunDispatcher } from '../run-dispatcher.js';

// O que o despachante usa da fila: reivindicar, manter o batimento, recuperar órfãs e devolver ao encerrar.
export type RunQueuePort = Pick<
  RunQueueRepository,
  | 'claimNextRun'
  | 'renewHeartbeat'
  | 'reclaimExpiredRuns'
  | 'releaseClaimedRuns'
  | 'cancelRunsOfInactiveOwners'
>;

// Executa UMA execução já reivindicada até o fim (a `worker_thread` de backtest ou de walk-forward).
export type RunExecutor = (runId: string) => Promise<unknown>;

// Relógio injetável do despachante: o batimento e a ronda periódica. `every` devolve quem cancela.
export type IntervalTimers = {
  readonly every: (milliseconds: number, task: () => Promise<void> | void) => () => void;
};

export type RunQueueDispatcherConfig = {
  // Um id por processo da API: o dono da posse das execuções reivindicadas (`runs.claimed_by`).
  readonly instanceId: string;
  // Teto de execuções simultâneas DESTA instância (`RUN_GLOBAL_CONCURRENCY`).
  readonly globalConcurrency: number;
  readonly heartbeatIntervalMilliseconds: number;
  readonly heartbeatTimeoutSeconds: number;
  readonly pollIntervalMilliseconds: number;
  // Teto de espera pela devolução ao encerrar: banco inalcançável não pode segurar o processo.
  readonly releaseTimeoutMilliseconds: number;
  readonly orphanPolicy: RunOrphanPolicy;
};

export type RunQueueDispatcherDependencies = {
  readonly queue: RunQueuePort;
  readonly executors: Readonly<Partial<Record<RunKind, RunExecutor>>>;
  // Derruba as threads em andamento (cada executor termina com o resultado `terminated`).
  readonly terminateExecutors: () => Promise<void>;
  readonly timers: IntervalTimers;
  readonly config: RunQueueDispatcherConfig;
  readonly reportUnexpectedError: (error: unknown) => void;
};

export type RunQueueDispatcher = RunDispatcher & {
  // Boot: recupera as órfãs, cancela as de contas inativas e REDESPACHA a fila durável; liga batimento e ronda.
  readonly start: () => Promise<void>;
  // Encerramento gracioso: para de reivindicar, derruba as threads e devolve à fila as execuções desta instância.
  readonly stop: () => Promise<void>;
  // A morte do processo, para teste: derruba as threads SEM tocar a fila (o batimento vence e outra instância recupera).
  readonly abandon: () => Promise<void>;
  readonly activeCount: () => number;
};
