// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EVENT_TYPE,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
} from './live72.constant.js';
import { appendEvent } from './live72-events.js';
import type { RotatingLog } from './rotating-log.js';

const SUCCESS_INTERVAL_MILLISECONDS = 6 * MILLISECONDS_PER_HOUR;
const FAILURE_INTERVAL_MILLISECONDS = 10 * MILLISECONDS_PER_MINUTE;
const CRON_TASKS = 'backfill-candles,sync-fear-greed';

export type CronJobOptions = {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly log: RotatingLog;
  readonly eventsFile: string;
  readonly waitForInfra: () => Promise<void>;
};

export type CronJob = { readonly stop: () => Promise<void> };

export function nextCronDelayMilliseconds(exitCode: number): number {
  return exitCode === 0 ? SUCCESS_INTERVAL_MILLISECONDS : FAILURE_INTERVAL_MILLISECONDS;
}

async function pump(stream: ReadableStream<Uint8Array>, log: RotatingLog): Promise<void> {
  for await (const chunk of stream) log.write(chunk);
}

type CronState = { current: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined };

async function runCronOnce(options: CronJobOptions, state: CronState): Promise<number> {
  const startedAt = Date.now();
  const child = Bun.spawn([...options.command], {
    cwd: options.cwd,
    env: { ...options.env, CRON_TASKS },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  state.current = child;
  await Promise.all([pump(child.stdout, options.log), pump(child.stderr, options.log)]);
  const exitCode = await child.exited;
  appendEvent(options.eventsFile, EVENT_TYPE.CRON_RUN, {
    exitCode,
    durationSeconds: Math.round((Date.now() - startedAt) / MILLISECONDS_PER_SECOND),
  });
  return exitCode;
}

export function scheduleCron(options: CronJobOptions): CronJob {
  const abort = new AbortController();
  const state: CronState = { current: undefined };
  const sleep = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, milliseconds);
      abort.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  const loop = (async (): Promise<void> => {
    while (!abort.signal.aborted) {
      await options.waitForInfra();
      if (abort.signal.aborted) return;
      const exitCode = await runCronOnce(options, state);
      await sleep(nextCronDelayMilliseconds(exitCode));
    }
  })();
  return {
    stop: async (): Promise<void> => {
      abort.abort();
      state.current?.kill('SIGTERM');
      await loop;
    },
  };
}
