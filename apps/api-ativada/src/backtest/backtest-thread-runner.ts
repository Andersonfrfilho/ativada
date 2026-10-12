// Copyright (c) 2026 Ada Technology. All rights reserved.
import { BACKTEST_ERROR_CODE } from './backtest.constant.js';
import {
  BACKTEST_EVENT_SCHEMA,
  BACKTEST_MESSAGE_TYPE,
  type BacktestEvent,
} from './backtest-messages.js';
import {
  finalize,
  type BacktestThreadOutcome,
  type RecordFailure,
  type Settlement,
} from './thread-outcome.js';

export type BacktestThreadRunnerParams = {
  readonly workerUrl: string;
  // Variáveis que a thread recebe (a conexão com o banco); nada além disso atravessa.
  readonly workerEnvironment: Readonly<Record<string, string>>;
  readonly timeoutMilliseconds: number;
  // A thread principal marca `failed` quando a thread morreu ou estourou o tempo: a thread não pode.
  readonly recordFailure: RecordFailure;
  readonly onProgress?: (event: { readonly runId: string; readonly progress: number }) => void;
};

export type BacktestThreadRunner = {
  readonly run: (runId: string) => Promise<BacktestThreadOutcome>;
  readonly terminateAll: () => Promise<void>;
};

function parseEvent(data: unknown): BacktestEvent | undefined {
  const parsed = BACKTEST_EVENT_SCHEMA.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

function isTerminal(event: BacktestEvent): boolean {
  return (
    event.type === BACKTEST_MESSAGE_TYPE.COMPLETED ||
    event.type === BACKTEST_MESSAGE_TYPE.CANCELLED ||
    event.type === BACKTEST_MESSAGE_TYPE.FAILED
  );
}

// Uma execução, uma thread: o ciclo de vida inteiro (partida, pedido, eventos, tempo, morte) vive aqui.
class ThreadRun {
  readonly outcome: Promise<BacktestThreadOutcome>;
  private resolveOutcome: (outcome: BacktestThreadOutcome) => void = () => undefined;
  private isSettled = false;
  private startMilliseconds = 0;
  private readonly startedAt = performance.now();
  private readonly timer: ReturnType<typeof setTimeout>;
  private worker: Worker | undefined;

  constructor(
    private readonly params: BacktestThreadRunnerParams,
    private readonly runId: string,
  ) {
    this.outcome = new Promise((resolve) => {
      this.resolveOutcome = resolve;
    });
    this.timer = setTimeout(
      () => this.settle({ kind: 'failure', errorCode: BACKTEST_ERROR_CODE.BACKTEST_TIMEOUT }),
      params.timeoutMilliseconds,
    );
    this.start();
  }

  terminate(): void {
    this.settle({ kind: 'terminated' });
  }

  private start(): void {
    try {
      const worker = new Worker(this.params.workerUrl, {
        env: { ...this.params.workerEnvironment },
      });
      this.worker = worker;
      worker.addEventListener('message', (message: MessageEvent) => this.onMessage(message.data));
      worker.addEventListener('error', () => this.crash());
      worker.addEventListener('close', () => this.crash());
    } catch {
      this.crash();
    }
  }

  private crash(): void {
    this.settle({ kind: 'failure', errorCode: BACKTEST_ERROR_CODE.WORKER_CRASHED });
  }

  private onMessage(data: unknown): void {
    const event = parseEvent(data);
    if (event === undefined) return this.crash();
    if (event.type === BACKTEST_MESSAGE_TYPE.READY) {
      this.startMilliseconds = performance.now() - this.startedAt;
      return this.worker?.postMessage({ type: BACKTEST_MESSAGE_TYPE.RUN, runId: this.runId });
    }
    if (event.type === BACKTEST_MESSAGE_TYPE.PROGRESS) {
      return this.params.onProgress?.({ runId: this.runId, progress: event.progress });
    }
    if (isTerminal(event)) {
      this.settle({ kind: 'event', event, startMilliseconds: this.startMilliseconds });
    }
  }

  private settle(settlement: Settlement): void {
    if (this.isSettled) return;
    this.isSettled = true;
    clearTimeout(this.timer);
    this.worker?.terminate();
    void finalize(this.params, this.runId, settlement).then(this.resolveOutcome);
  }
}

// Roda cada backtest numa thread própria: o laço de eventos da API nunca espera por ele (RNF02).
export function createBacktestThreadRunner(
  params: BacktestThreadRunnerParams,
): BacktestThreadRunner {
  const active = new Set<ThreadRun>();
  return {
    async run(runId): Promise<BacktestThreadOutcome> {
      const run = new ThreadRun(params, runId);
      active.add(run);
      try {
        return await run.outcome;
      } finally {
        active.delete(run);
      }
    },
    async terminateAll(): Promise<void> {
      const running = [...active];
      for (const run of running) run.terminate();
      await Promise.all(running.map((run) => run.outcome));
    },
  };
}
