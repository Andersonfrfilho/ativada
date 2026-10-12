// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EVENT_TYPE, MILLISECONDS_PER_SECOND } from './live72.constant.js';
import { appendEvent, readEventsFile } from './live72-events.js';
import type { RunCounts } from './run-counts.js';
import { readRunFile } from './run-file.js';
import type { SupervisedProcess } from './supervised-process.js';

const CHECK_INTERVAL_MILLISECONDS = 30 * MILLISECONDS_PER_SECOND;

export type KillDueParams = {
  readonly now: number;
  readonly plannedAt: number;
  readonly plannedEnd: number;
  readonly isAlreadyFired: boolean;
};

// Depois do término previsto o reinício já não prova nada sobre a janela das 72 h: não dispara.
export function isKillDue(params: KillDueParams): boolean {
  if (params.isAlreadyFired) return false;
  return params.now >= params.plannedAt && params.now < params.plannedEnd;
}

export type ControlledKillOptions = {
  readonly runFile: string;
  readonly eventsFile: string;
  readonly worker: Pick<SupervisedProcess, 'killControlled'>;
  readonly readCounts: (runId: string) => Promise<RunCounts | null>;
  readonly now?: () => number;
};

export async function fireControlledKillIfDue(options: ControlledKillOptions): Promise<boolean> {
  const run = readRunFile(options.runFile);
  if (run === undefined) return false;
  const isAlreadyFired = readEventsFile(options.eventsFile).events.some(
    (event) => event.type === EVENT_TYPE.CONTROLLED_WORKER_KILL && event.at >= run.startedAt,
  );
  const now = (options.now ?? Date.now)();
  const due = isKillDue({
    now,
    plannedAt: Date.parse(run.plannedWorkerKillAt),
    plannedEnd: Date.parse(run.plannedEndAt),
    isAlreadyFired,
  });
  if (!due) return false;
  const before = await options.readCounts(run.runId).catch(() => null);
  const isKilled = options.worker.killControlled();
  if (isKilled) {
    appendEvent(options.eventsFile, EVENT_TYPE.CONTROLLED_WORKER_KILL, {
      plannedFor: run.plannedWorkerKillAt,
      before,
    });
  }
  return isKilled;
}

export function scheduleControlledKill(options: ControlledKillOptions): { stop: () => void } {
  const timer = setInterval(() => {
    void fireControlledKillIfDue(options).catch(() => undefined);
  }, CHECK_INTERVAL_MILLISECONDS);
  return { stop: (): void => clearInterval(timer) };
}
