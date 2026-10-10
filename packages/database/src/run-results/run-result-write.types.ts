// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DatabaseExecutor } from '../database-executor.js';
import type { UserId } from '../ownership/user-id.js';

export type WriteRequest<TInput> = {
  readonly executor: DatabaseExecutor;
  readonly ownerUserId: UserId;
  readonly runId: string;
  readonly rows: readonly TInput[];
};
