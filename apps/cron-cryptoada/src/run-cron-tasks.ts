// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readPostgresErrorCode } from '@cryptoada/database';

import { EXIT_CODE, NO_ERROR_CODE, type ExitCode } from './cron.constant.js';
import type { CronLogger } from './logging/cron-logger.js';

export type CronTaskSummary = Readonly<Record<string, number>> & { readonly failures: number };

export type CronTask = {
  readonly name: string;
  readonly run: () => Promise<CronTaskSummary>;
};

async function runTask(task: CronTask, logger: CronLogger): Promise<ExitCode> {
  try {
    const summary = await task.run();
    logger.info(`${task.name} finished`, summary);
    return summary.failures > 0 ? EXIT_CODE.FAILURE : EXIT_CODE.SUCCESS;
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const errorCode = readPostgresErrorCode(error) ?? NO_ERROR_CODE;
    logger.error(`${task.name} failed`, { errorName, errorCode });
    return EXIT_CODE.FAILURE;
  }
}

export async function runCronTasks(
  tasks: readonly CronTask[],
  logger: CronLogger,
): Promise<ExitCode> {
  let exitCode: ExitCode = EXIT_CODE.SUCCESS;
  for (const task of tasks) {
    const taskExitCode = await runTask(task, logger);
    if (taskExitCode === EXIT_CODE.FAILURE) exitCode = EXIT_CODE.FAILURE;
  }
  return exitCode;
}
