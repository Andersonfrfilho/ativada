// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DatabaseHandle } from '../src/database-handle.js';
import { RUN_KIND, type RunKind } from '../src/runs/run.constant.js';
import { createRunRepository } from '../src/runs/run.repository.js';
import { RUN_STATUS } from '../src/runs/run.constant.js';
import {
  buildRunParams,
  resolvePersistenceOwner,
  seedStrategyVersion,
  type PersistenceOwner,
} from './persistence-seed.js';

export type QueueOwner = PersistenceOwner & { readonly versionId: string };

// Limites altos o bastante para que só o teste que quer um teto o imponha.
export const UNBOUNDED_LIMITS = {
  maxConcurrentBacktests: 100,
  maxConcurrentWalkForwards: 100,
  maxActiveLivePaperRuns: 100,
} as const;

// A fila é global: cada verificação começa de uma fila vazia, cancelando o que as anteriores deixaram.
export async function resetQueue(client: Bun.SQL): Promise<void> {
  await client`UPDATE runs SET status = 'cancelled', finished_at = now(), claimed_by = NULL, heartbeat_at = NULL WHERE status IN ('queued', 'running')`;
}

export async function setLimits(
  client: Bun.SQL,
  owner: PersistenceOwner,
  limits: unknown,
): Promise<void> {
  await client.unsafe('UPDATE users SET limits = $1::jsonb WHERE id = $2', [
    JSON.stringify(limits),
    owner.userId,
  ]);
}

export async function createQueueOwner(
  handle: DatabaseHandle,
  subject: string,
): Promise<QueueOwner> {
  const owner = await resolvePersistenceOwner(handle, subject);
  const version = await seedStrategyVersion(handle, owner);
  return { ...owner, versionId: version.id };
}

export async function enqueueRuns(
  handle: DatabaseHandle,
  owner: QueueOwner,
  params: { readonly kind: RunKind; readonly count: number },
): Promise<readonly string[]> {
  const runs = createRunRepository(handle);
  const ids: string[] = [];
  for (let index = 0; index < params.count; index += 1) {
    const created = await runs.createRun(
      owner.scope,
      buildRunParams(owner.versionId, { kind: params.kind }),
    );
    if (created === undefined) throw new Error('execução não criada');
    ids.push(created.id);
  }
  return ids;
}

export async function completeRun(
  handle: DatabaseHandle,
  owner: PersistenceOwner,
  runId: string,
): Promise<void> {
  await createRunRepository(handle).transitionRun(owner.scope, {
    runId,
    to: RUN_STATUS.COMPLETED,
  });
}

export async function readRunRow(client: Bun.SQL, runId: string): Promise<Record<string, unknown>> {
  const rows: unknown = await client.unsafe(
    'SELECT status, claimed_by, heartbeat_at, started_at, finished_at, error_code, engine_state IS NOT NULL AS has_checkpoint, progress FROM runs WHERE id = $1',
    [runId],
  );
  return (rows as readonly Record<string, unknown>[])[0] ?? {};
}

export const KIND = RUN_KIND;
