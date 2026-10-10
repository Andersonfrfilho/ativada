// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CronTask } from './run-cron-tasks.js';

export type SelectCronTasksParams = {
  readonly tasks: readonly CronTask[];
  readonly names: readonly string[] | undefined;
};

export function selectCronTasks(params: SelectCronTasksParams): readonly CronTask[] {
  const { tasks, names } = params;
  if (names === undefined) return tasks;
  return tasks.filter((task) => names.includes(task.name));
}
