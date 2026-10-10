// Copyright (c) 2026 Ada Technology. All rights reserved.
import { WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';
import type { WalkForwardRequest } from './walk-forward.types.js';
import {
  WALK_FORWARD_EVENT_SCHEMA,
  WALK_FORWARD_MESSAGE_TYPE,
  type WalkForwardEvent,
} from './walk-forward-messages.js';
import {
  finalize,
  type RecordFailure,
  type Settlement,
  type WalkForwardThreadOutcome,
} from './walk-forward-thread-outcome.js';

export type WalkForwardThreadRunnerParams = {
  readonly workerUrl: string;
  // Variáveis que a thread recebe (a conexão com o banco e as threads de busca); nada além disso atravessa.
  readonly workerEnvironment: Readonly<Record<string, string>>;
  readonly timeoutMilliseconds: number;
  // A thread principal marca `failed` quando a thread morreu ou estourou o tempo: a thread não pode.
  readonly recordFailure: RecordFailure;
  readonly onProgress?: (event: { readonly runId: string; readonly progress: number }) => void;
};

export type WalkForwardThreadRunner = {
  readonly run: (runId: string, request: WalkForwardRequest) => Promise<WalkForwardThreadOutcome>;
  readonly terminateAll: () => Promise<void>;
};

function parseEvent(data: unknown): WalkForwardEvent | undefined {
  const parsed = WALK_FORWARD_EVENT_SCHEMA.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

function isTerminal(event: WalkForwardEvent): boolean {
  return (
    event.type === WALK_FORWARD_MESSAGE_TYPE.COMPLETED ||
    event.type === WALK_FORWARD_MESSAGE_TYPE.CANCELLED ||
    event.type === WALK_FORWARD_MESSAGE_TYPE.FAILED
  );
}

// Uma execução, uma thread (o coordenador): o ciclo de vida inteiro (partida, pedido, eventos, tempo, morte) vive
// aqui. As threads de BUSCA são criadas lá dentro, pelo coordenador, e morrem com ele.
class ThreadRun {
  readonly outcome: Promise<WalkForwardThreadOutcome>;
  private resolveOutcome: (outcome: WalkForwardThreadOutcome) => void = () => undefined;
  private isSettled = false;
  private startMilliseconds = 0;
  private readonly startedAt = performance.now();
  private readonly timer: ReturnType<typeof setTimeout>;
  private worker: Worker | undefined;

  constructor(
    private readonly params: WalkForwardThreadRunnerParams,
    private readonly runId: string,
    private readonly request: WalkForwardRequest,
  ) {
    this.outcome = new Promise((resolve) => {
      this.resolveOutcome = resolve;
    });
    this.timer = setTimeout(
      () =>
        this.settle({ kind: 'failure', errorCode: WALK_FORWARD_ERROR_CODE.WALK_FORWARD_TIMEOUT }),
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
    this.settle({ kind: 'failure', errorCode: WALK_FORWARD_ERROR_CODE.WORKER_CRASHED });
  }

  private onMessage(data: unknown): void {
    const event = parseEvent(data);
    if (event === undefined) return this.crash();
    if (event.type === WALK_FORWARD_MESSAGE_TYPE.READY) {
      this.startMilliseconds = performance.now() - this.startedAt;
      return this.worker?.postMessage({
        type: WALK_FORWARD_MESSAGE_TYPE.RUN,
        runId: this.runId,
        request: this.request,
      });
    }
    if (event.type === WALK_FORWARD_MESSAGE_TYPE.PROGRESS) {
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

// Roda cada walk-forward numa thread própria: o laço de eventos da API nunca espera por ele (RNF02).
export function createWalkForwardThreadRunner(
  params: WalkForwardThreadRunnerParams,
): WalkForwardThreadRunner {
  const active = new Set<ThreadRun>();
  return {
    async run(runId, request): Promise<WalkForwardThreadOutcome> {
      const run = new ThreadRun(params, runId, request);
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
