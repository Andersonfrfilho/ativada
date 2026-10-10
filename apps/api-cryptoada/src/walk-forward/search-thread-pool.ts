// Copyright (c) 2026 Ada Technology. All rights reserved.
import { WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import { SEARCH_EVENT_SCHEMA, SEARCH_MESSAGE_TYPE, type SearchEvent } from './search-messages.js';
import type { CombinationSearcher, SearchInput, WindowSummary } from './search-input.js';

type Pending = {
  readonly combinationIndex: number;
  readonly resolve: (windows: readonly WindowSummary[]) => void;
  readonly reject: (error: unknown) => void;
};

type PoolWorker = {
  readonly worker: Worker;
  isReady: boolean;
  current: number | undefined;
};

function workerFailure(): WalkForwardRunError {
  return new WalkForwardRunError(
    WALK_FORWARD_ERROR_CODE.SEARCH_WORKER_FAILED,
    'Uma thread de busca do walk-forward falhou.',
  );
}

function parseEvent(data: unknown): SearchEvent | undefined {
  const parsed = SEARCH_EVENT_SCHEMA.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

class SearchThreadPool implements CombinationSearcher {
  private readonly workers: PoolWorker[] = [];
  private readonly queue: { readonly taskId: number; readonly pending: Pending }[] = [];
  private readonly inFlight = new Map<number, Pending>();
  private nextTaskId = 0;
  private isDead = false;

  constructor(
    private readonly input: SearchInput,
    threads: number,
    workerUrl: string,
  ) {
    for (let position = 0; position < threads; position += 1) this.spawn(workerUrl);
  }

  evaluate(combinationIndex: number): Promise<readonly WindowSummary[]> {
    if (this.isDead) return Promise.reject(workerFailure());
    return new Promise((resolve, reject) => {
      this.queue.push({ taskId: this.nextTaskId, pending: { combinationIndex, resolve, reject } });
      this.nextTaskId += 1;
      this.dispatch();
    });
  }

  close(): Promise<void> {
    this.isDead = true;
    for (const { worker } of this.workers) worker.terminate();
    return Promise.resolve();
  }

  private spawn(workerUrl: string): void {
    const worker = new Worker(workerUrl);
    const entry: PoolWorker = { worker, isReady: false, current: undefined };
    this.workers.push(entry);
    worker.addEventListener('message', (message: MessageEvent) =>
      this.onMessage(entry, message.data),
    );
    worker.addEventListener('error', () => this.fail());
    worker.addEventListener('close', () => {
      if (!this.isDead) this.fail();
    });
  }

  private onMessage(entry: PoolWorker, data: unknown): void {
    const event = parseEvent(data);
    if (event === undefined || event.type === SEARCH_MESSAGE_TYPE.FAILED) return this.fail();
    if (event.type === SEARCH_MESSAGE_TYPE.STARTED) {
      return entry.worker.postMessage({ type: SEARCH_MESSAGE_TYPE.INIT, ...this.input });
    }
    if (event.type === SEARCH_MESSAGE_TYPE.READY) {
      entry.isReady = true;
      return this.dispatch();
    }
    if (event.type !== SEARCH_MESSAGE_TYPE.RESULT) return;
    const pending = this.inFlight.get(event.taskId);
    entry.current = undefined;
    this.inFlight.delete(event.taskId);
    if (pending?.combinationIndex !== event.combinationIndex) return this.fail();
    pending.resolve(event.windows);
    this.dispatch();
  }

  private dispatch(): void {
    for (const entry of this.workers) {
      if (!entry.isReady || entry.current !== undefined) continue;
      const next = this.queue.shift();
      if (next === undefined) return;
      entry.current = next.taskId;
      this.inFlight.set(next.taskId, next.pending);
      entry.worker.postMessage({
        type: SEARCH_MESSAGE_TYPE.EVALUATE,
        taskId: next.taskId,
        combinationIndex: next.pending.combinationIndex,
      });
    }
  }

  private fail(): void {
    if (this.isDead) return;
    this.isDead = true;
    for (const { worker } of this.workers) worker.terminate();
    const waiting = [...this.inFlight.values(), ...this.queue.map((item) => item.pending)];
    this.inFlight.clear();
    this.queue.length = 0;
    for (const pending of waiting) pending.reject(workerFailure());
  }
}

export function createThreadedSearcher(params: {
  readonly input: SearchInput;
  readonly threads: number;
  readonly workerUrl: string;
}): CombinationSearcher {
  return new SearchThreadPool(params.input, params.threads, params.workerUrl);
}
