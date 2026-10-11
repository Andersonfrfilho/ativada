// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EvaluateGoalParams } from '@cryptoada/strategy-engine';

import type { GoalComputation } from './goal-computation.js';
import { PoolSlot, type PoolTask } from './goal-pool-slot.js';

export type GoalEvaluationPoolParams = {
  readonly workerUrl: string;
  // Quantas threads, no máximo: o trabalho que passa disso espera na fila.
  readonly size: number;
  readonly timeoutMilliseconds: number;
};

export type ComputeGoalCombination = (
  request: EvaluateGoalParams,
  signal?: AbortSignal,
) => Promise<GoalComputation>;

export type GoalEvaluationPool = {
  readonly compute: ComputeGoalCombination;
  readonly close: () => void;
};

const POOL_CLOSED_MESSAGE = 'O pool de avaliação de metas foi encerrado.';

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

class Pool implements GoalEvaluationPool {
  private readonly queue: PoolTask[] = [];
  private readonly slots: PoolSlot[];
  private nextId = 0;
  private isClosed = false;

  constructor(params: GoalEvaluationPoolParams) {
    const slotParams = { ...params, onFree: (): void => this.pump() };
    this.slots = Array.from({ length: params.size }, () => new PoolSlot(slotParams));
  }

  readonly compute: ComputeGoalCombination = (request, signal) => {
    if (this.isClosed) return Promise.reject(new Error(POOL_CLOSED_MESSAGE));
    if (signal?.aborted === true) return Promise.reject(toError(signal.reason));
    return new Promise<GoalComputation>((resolve, reject) => {
      this.nextId += 1;
      const task: PoolTask = {
        id: this.nextId,
        request,
        resolve,
        reject,
        detach: () => undefined,
      };
      this.watchAbort(task, signal);
      this.queue.push(task);
      this.pump();
    });
  };

  readonly close = (): void => {
    this.isClosed = true;
    for (const task of this.queue.splice(0)) {
      task.detach();
      task.reject(new Error(POOL_CLOSED_MESSAGE));
    }
    for (const slot of this.slots) slot.terminate();
  };

  private watchAbort(task: PoolTask, signal: AbortSignal | undefined): void {
    if (signal === undefined) return;
    const onAbort = (): void => {
      const reason = toError(signal.reason);
      const queuedAt = this.queue.indexOf(task);
      if (queuedAt >= 0) this.queue.splice(queuedAt, 1);
      task.detach();
      task.reject(reason);
      for (const slot of this.slots) slot.cancel(task, reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    task.detach = (): void => signal.removeEventListener('abort', onAbort);
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (!slot.isIdle) continue;
      const task = this.queue.shift();
      if (task === undefined) return;
      slot.run(task);
    }
  }
}

// O pool LIMITADO de `worker_threads` da avaliação de metas: o cálculo do motor é síncrono e nunca roda na thread da API
// (RNF02). Cada tarefa tem tempo máximo e pode ser cancelada; ao estourar ou cancelar, a thread morre e outra nasce.
export function createGoalEvaluationPool(params: GoalEvaluationPoolParams): GoalEvaluationPool {
  return new Pool(params);
}
