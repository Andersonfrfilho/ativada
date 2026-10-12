// Copyright (c) 2026 Ada Technology. All rights reserved.
import { rmSync, writeFileSync } from 'node:fs';

import { EVENT_TYPE, MILLISECONDS_PER_MINUTE, MILLISECONDS_PER_SECOND } from './live72.constant.js';
import { appendEvent } from './live72-events.js';
import type { RotatingLog } from './rotating-log.js';

const BASE_BACKOFF_MILLISECONDS = 2 * MILLISECONDS_PER_SECOND;
const MAXIMUM_BACKOFF_MILLISECONDS = MILLISECONDS_PER_MINUTE;
const STABLE_UPTIME_MILLISECONDS = 5 * MILLISECONDS_PER_MINUTE;
const GRACEFUL_STOP_MILLISECONDS = 10 * MILLISECONDS_PER_SECOND;

export type SupervisedProcessOptions = {
  readonly name: string;
  readonly command: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly log: RotatingLog;
  readonly eventsFile: string;
  readonly pidFile: string;
  readonly waitForInfra: () => Promise<void>;
};

export type SupervisedProcess = {
  readonly name: string;
  readonly killControlled: () => boolean;
  readonly stop: () => Promise<void>;
};

// Espera crescente entre reinícios; um processo que viveu bastante zera a contagem de falhas.
export function computeBackoffMilliseconds(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  const doubled = BASE_BACKOFF_MILLISECONDS * 2 ** (consecutiveFailures - 1);
  return Math.min(doubled, MAXIMUM_BACKOFF_MILLISECONDS);
}

export function nextFailureCount(params: {
  readonly previous: number;
  readonly uptimeMilliseconds: number;
  readonly isControlled: boolean;
}): number {
  if (params.isControlled || params.uptimeMilliseconds >= STABLE_UPTIME_MILLISECONDS) return 0;
  return params.previous + 1;
}

async function pump(
  stream: ReadableStream<Uint8Array> | undefined,
  log: RotatingLog,
): Promise<void> {
  if (stream === undefined) return;
  for await (const chunk of stream) log.write(chunk);
}

type ProcessState = {
  current: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  isStopping: boolean;
  isControlledPending: boolean;
  wake: (() => void) | undefined;
};

type RunOutcome = { readonly uptimeMilliseconds: number; readonly isControlled: boolean };

async function runOnce(
  options: SupervisedProcessOptions,
  state: ProcessState,
): Promise<RunOutcome> {
  const startedAt = Date.now();
  const child = Bun.spawn([...options.command], {
    cwd: options.cwd,
    env: { ...options.env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  state.current = child;
  writeFileSync(options.pidFile, `${child.pid}\n`);
  appendEvent(options.eventsFile, EVENT_TYPE.CHILD_START, { child: options.name, pid: child.pid });
  await Promise.all([pump(child.stdout, options.log), pump(child.stderr, options.log)]);
  const exitCode = await child.exited;
  const outcome = {
    uptimeMilliseconds: Date.now() - startedAt,
    isControlled: state.isControlledPending,
  };
  state.isControlledPending = false;
  rmSync(options.pidFile, { force: true });
  appendEvent(options.eventsFile, EVENT_TYPE.CHILD_EXIT, {
    child: options.name,
    exitCode,
    signal: child.signalCode,
    uptimeSeconds: Math.round(outcome.uptimeMilliseconds / MILLISECONDS_PER_SECOND),
    controlled: outcome.isControlled,
    stopping: state.isStopping,
  });
  return outcome;
}

async function superviseLoop(
  options: SupervisedProcessOptions,
  state: ProcessState,
): Promise<void> {
  let failures = 0;
  while (!state.isStopping) {
    await options.waitForInfra();
    if (state.isStopping) return;
    const outcome = await runOnce(options, state);
    failures = nextFailureCount({ previous: failures, ...outcome });
    if (!state.isStopping) await sleepUnlessStopped(state, computeBackoffMilliseconds(failures));
  }
}

function sleepUnlessStopped(state: ProcessState, milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    state.wake = (): void => {
      clearTimeout(timer);
      resolve();
    };
  });
}

function killControlled(state: ProcessState): boolean {
  const child = state.current;
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return false;
  state.isControlledPending = true;
  child.kill('SIGKILL');
  return true;
}

async function stopProcess(state: ProcessState, running: Promise<void>): Promise<void> {
  state.isStopping = true;
  state.wake?.();
  const child = state.current;
  child?.kill('SIGTERM');
  const timer = setTimeout(() => child?.kill('SIGKILL'), GRACEFUL_STOP_MILLISECONDS);
  await running;
  clearTimeout(timer);
}

export function superviseProcess(options: SupervisedProcessOptions): SupervisedProcess {
  const state: ProcessState = {
    current: undefined,
    isStopping: false,
    isControlledPending: false,
    wake: undefined,
  };
  const running = superviseLoop(options, state);
  return {
    name: options.name,
    killControlled: (): boolean => killControlled(state),
    stop: (): Promise<void> => stopProcess(state, running),
  };
}
