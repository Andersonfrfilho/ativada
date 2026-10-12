// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EvaluateGoalParams } from '@ativada/strategy-engine';

import type { GoalComputation } from './goal-computation.js';
import { GOAL_WORKER_EVENT_SCHEMA, GOAL_WORKER_MESSAGE } from './goal-evaluation-messages.js';
import { GoalEvaluationTimeoutError } from './goal.error.js';

export type PoolTask = {
  readonly id: number;
  readonly request: EvaluateGoalParams;
  readonly resolve: (computation: GoalComputation) => void;
  readonly reject: (reason: unknown) => void;
  // Solta o ouvinte de cancelamento da tarefa quando ela termina.
  detach: () => void;
};

export type PoolSlotParams = {
  readonly workerUrl: string;
  readonly timeoutMilliseconds: number;
  readonly onFree: () => void;
};

const WORKER_FAILURE_MESSAGE = 'A thread de avaliação de metas falhou.';

// Uma thread do pool: nasce quando a primeira tarefa chega, atende uma tarefa por vez e MORRE quando a tarefa estoura o
// tempo ou é cancelada (a única forma de parar um cálculo síncrono); a seguinte sobe outra.
export class PoolSlot {
  private worker: Worker | undefined;
  private isReady = false;
  private current: PoolTask | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly params: PoolSlotParams) {}

  get isIdle(): boolean {
    return this.current === undefined;
  }

  run(task: PoolTask): void {
    this.current = task;
    this.timer = setTimeout(
      () => this.finish(task, { kill: true, fail: new GoalEvaluationTimeoutError() }),
      this.params.timeoutMilliseconds,
    );
    this.worker ??= this.spawn();
    if (this.isReady) this.post(task);
  }

  cancel(task: PoolTask, reason: unknown): void {
    if (this.current === task) this.finish(task, { kill: true, fail: reason });
  }

  terminate(): void {
    const task = this.current;
    if (task !== undefined)
      this.finish(task, { kill: true, fail: new Error(WORKER_FAILURE_MESSAGE) });
    this.kill();
  }

  private spawn(): Worker {
    const worker = new Worker(this.params.workerUrl);
    worker.addEventListener('message', (message: MessageEvent) =>
      this.onMessage(worker, message.data),
    );
    worker.addEventListener('error', () => this.onGone(worker));
    worker.addEventListener('close', () => this.onGone(worker));
    return worker;
  }

  private post(task: PoolTask): void {
    this.worker?.postMessage({
      type: GOAL_WORKER_MESSAGE.COMPUTE,
      id: task.id,
      request: task.request,
    });
  }

  private onMessage(from: Worker, data: unknown): void {
    if (from !== this.worker) return;
    const event = GOAL_WORKER_EVENT_SCHEMA.safeParse(data);
    const task = this.current;
    if (!event.success) return this.onGone(from);
    if (event.data.type === GOAL_WORKER_MESSAGE.READY) {
      this.isReady = true;
      if (task !== undefined) this.post(task);
      return;
    }
    if (task === undefined || event.data.id !== task.id) return;
    if (event.data.type === GOAL_WORKER_MESSAGE.RESULT) {
      this.finish(task, { kill: false, value: event.data.computation });
      return;
    }
    this.finish(task, { kill: false, fail: new Error(WORKER_FAILURE_MESSAGE) });
  }

  private onGone(from: Worker): void {
    if (from !== this.worker) return;
    this.kill();
    if (this.current !== undefined) {
      this.finish(this.current, { kill: false, fail: new Error(WORKER_FAILURE_MESSAGE) });
    }
  }

  private finish(
    task: PoolTask,
    outcome: { readonly kill: boolean; readonly value?: GoalComputation; readonly fail?: unknown },
  ): void {
    clearTimeout(this.timer);
    this.current = undefined;
    task.detach();
    if (outcome.kill) this.kill();
    if (outcome.value === undefined) task.reject(outcome.fail);
    else task.resolve(outcome.value);
    this.params.onFree();
  }

  private kill(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.isReady = false;
  }
}
