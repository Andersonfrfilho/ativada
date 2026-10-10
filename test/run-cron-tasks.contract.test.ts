// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { EXIT_CODE } from '../apps/cron-cryptoada/src/cron.constant.js';
import { createCronLogger } from '../apps/cron-cryptoada/src/logging/cron-logger.js';
import { runCronTasks, type CronTask } from '../apps/cron-cryptoada/src/run-cron-tasks.js';

function createSubject(): { readonly lines: string[]; readonly order: string[] } {
  return { lines: [], order: [] };
}

function task(
  name: string,
  subject: { readonly order: string[] },
  outcome: { readonly failures: number } | Error,
): CronTask {
  return {
    name,
    run: (): Promise<{ readonly failures: number }> => {
      subject.order.push(name);
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
    },
  };
}

function logger(subject: { readonly lines: string[] }): ReturnType<typeof createCronLogger> {
  return createCronLogger({
    appName: 'cron-cryptoada',
    write: (line) => void subject.lines.push(line),
  });
}

describe('runCronTasks', () => {
  test('runs the tasks in order and exits 0 when none failed', async () => {
    const subject = createSubject();
    const code = await runCronTasks(
      [task('first', subject, { failures: 0 }), task('second', subject, { failures: 0 })],
      logger(subject),
    );
    expect(subject.order).toStrictEqual(['first', 'second']);
    expect(code).toBe(EXIT_CODE.SUCCESS);
    expect(subject.lines.join('')).toContain('first finished');
  });

  test('exits 1 when a task reports failures, and still runs the next ones', async () => {
    const subject = createSubject();
    const code = await runCronTasks(
      [task('first', subject, { failures: 2 }), task('second', subject, { failures: 0 })],
      logger(subject),
    );
    expect(subject.order).toStrictEqual(['first', 'second']);
    expect(code).toBe(EXIT_CODE.FAILURE);
  });

  test('a task that throws exits 1, is logged by name only and does not stop the next', async () => {
    const subject = createSubject();
    const code = await runCronTasks(
      [
        task('first', subject, new Error('secret detail that must not be logged')),
        task('second', subject, { failures: 0 }),
      ],
      logger(subject),
    );
    expect(subject.order).toStrictEqual(['first', 'second']);
    expect(code).toBe(EXIT_CODE.FAILURE);
    const log = subject.lines.join('');
    expect(log).toContain('first failed');
    expect(log).not.toContain('secret detail');
  });
});
