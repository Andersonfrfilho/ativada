// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ClaimedRun } from '@ativada/database';

import type { RunDispatchRequest } from '../run-dispatcher.js';
import type {
  RunQueueDispatcher,
  RunQueueDispatcherDependencies,
} from './run-queue-dispatcher.types.js';

const NO_EXECUTOR_MESSAGE = 'Tipo de execução sem executor.';
const SHUTDOWN_TIMEOUT_MESSAGE = 'O encerramento da fila passou do prazo.';
const CLAIM_LOST_MESSAGE = 'Outra instância recuperou execuções que esta ainda rodava:';

// A fila é o banco; este objeto só reivindica a próxima execução elegível (round-robin entre usuários, tetos por usuário
// e tipo, tudo decidido pelo repositório), executa até o teto GLOBAL desta instância, mantém o batimento do que roda e
// recupera as órfãs. Uma instância caída deixa o batimento vencer e outra a recupera.
class RunQueueEngine {
  private readonly active = new Map<string, Promise<void>>();
  private readonly cancelTimers: (() => void)[] = [];
  private isStarted = false;
  private isStopping = false;
  private isPumping = false;
  private isPumpRequested = false;
  private pumpInFlight: Promise<void> | undefined;

  constructor(private readonly dependencies: RunQueueDispatcherDependencies) {}

  activeCount(): number {
    return this.active.size;
  }

  dispatch(request: RunDispatchRequest): Promise<void> {
    if (this.dependencies.executors[request.kind] === undefined) {
      return Promise.reject(new Error(NO_EXECUTOR_MESSAGE));
    }
    if (!this.isStopping) void this.pump();
    return Promise.resolve();
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;
    const { timers, config } = this.dependencies;
    this.cancelTimers.push(
      timers.every(config.pollIntervalMilliseconds, () => this.maintain()),
      timers.every(config.heartbeatIntervalMilliseconds, () => this.renewHeartbeat()),
    );
    await this.maintain();
  }

  async stop(): Promise<void> {
    this.haltLocally();
    // Um claim em voo termina antes da devolução: a execução que ele reivindicou não é lançada (`isStopping`) e a
    // devolução geral a leva de volta à fila.
    await this.guarded(() => this.withinShutdownTimeout(this.pumpInFlight ?? Promise.resolve()));
    await this.endExecutions();
    // Se o banco não responde agora, o batimento vence e outra instância (ou o próximo boot) recupera a execução.
    await this.guarded(() => this.withinShutdownTimeout(this.releaseClaimedRuns()));
  }

  private releaseClaimedRuns(): Promise<number> {
    const { queue, config } = this.dependencies;
    return queue.releaseClaimedRuns({ claimedBy: config.instanceId });
  }

  private async withinShutdownTimeout(task: Promise<unknown>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(SHUTDOWN_TIMEOUT_MESSAGE)),
        this.dependencies.config.releaseTimeoutMilliseconds,
      );
    });
    try {
      await Promise.race([task, expiry]);
    } finally {
      clearTimeout(timer);
    }
  }

  async abandon(): Promise<void> {
    this.haltLocally();
    await this.endExecutions();
  }

  private async guarded(task: () => Promise<unknown>): Promise<void> {
    try {
      await task();
    } catch (error: unknown) {
      this.dependencies.reportUnexpectedError(error);
    }
  }

  private async claim(): Promise<ClaimedRun | undefined> {
    try {
      return await this.dependencies.queue.claimNextRun({
        claimedBy: this.dependencies.config.instanceId,
      });
    } catch (error: unknown) {
      this.dependencies.reportUnexpectedError(error);
      return undefined;
    }
  }

  private launch(claimed: ClaimedRun): void {
    const executor = this.dependencies.executors[claimed.kind];
    if (executor === undefined) {
      this.dependencies.reportUnexpectedError(new Error(NO_EXECUTOR_MESSAGE));
      return;
    }
    const execution = this.guarded(() => executor(claimed.runId)).finally(() => {
      this.active.delete(claimed.runId);
      if (!this.isStopping) void this.pump();
    });
    this.active.set(claimed.runId, execution);
  }

  private async fillFreeSlots(): Promise<void> {
    while (!this.isStopping && this.active.size < this.dependencies.config.globalConcurrency) {
      const claimed = await this.claim();
      if (claimed === undefined || this.isStopping) return;
      this.launch(claimed);
    }
  }

  private async pump(): Promise<void> {
    if (this.isPumping) {
      this.isPumpRequested = true;
      return;
    }
    this.isPumping = true;
    this.pumpInFlight = this.runPumpCycles();
    try {
      await this.pumpInFlight;
    } finally {
      this.isPumping = false;
      this.pumpInFlight = undefined;
    }
  }

  private async runPumpCycles(): Promise<void> {
    do {
      this.isPumpRequested = false;
      await this.fillFreeSlots();
    } while (this.isPumpRequested && !this.isStopping);
  }

  private async maintain(): Promise<void> {
    const { queue, config } = this.dependencies;
    await this.guarded(() =>
      queue.reclaimExpiredRuns({
        heartbeatTimeoutSeconds: config.heartbeatTimeoutSeconds,
        orphanPolicy: config.orphanPolicy,
      }),
    );
    await this.guarded(() => queue.cancelRunsOfInactiveOwners());
    await this.pump();
  }

  private async renewHeartbeat(): Promise<void> {
    const runIds = [...this.active.keys()];
    if (runIds.length === 0) return;
    await this.guarded(async () => {
      const { queue, config } = this.dependencies;
      const { lost } = await queue.renewHeartbeat({ claimedBy: config.instanceId, runIds });
      if (lost.length > 0) {
        this.dependencies.reportUnexpectedError(
          new Error(`${CLAIM_LOST_MESSAGE} ${lost.join(', ')}`),
        );
      }
    });
  }

  private haltLocally(): void {
    this.isStopping = true;
    for (const cancel of this.cancelTimers.splice(0)) cancel();
  }

  private async endExecutions(): Promise<void> {
    const running = [...this.active.values()];
    await this.dependencies.terminateExecutors();
    await Promise.all(running);
  }
}

export function createRunQueueDispatcher(
  dependencies: RunQueueDispatcherDependencies,
): RunQueueDispatcher {
  const engine = new RunQueueEngine(dependencies);
  return {
    dispatch: (request) => engine.dispatch(request),
    start: () => engine.start(),
    stop: () => engine.stop(),
    abandon: () => engine.abandon(),
    activeCount: () => engine.activeCount(),
  };
}
