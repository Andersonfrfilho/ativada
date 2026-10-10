// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SAMPLE_PAUSE_MILLISECONDS, WAIT_TIMEOUT_MILLISECONDS } from './queue-test.constant.js';
import { assertCondition, type QueueTestContext } from './queue-test-context.js';

const FINAL_STATUSES: readonly string[] = ['completed', 'failed', 'cancelled'];
const MICROSECONDS_PER_SECOND = 1_000_000;

export type StatusSnapshot = Readonly<Record<string, string>>;

export type RunTimes = {
  readonly status: string;
  readonly startedMicros: bigint | undefined;
  readonly finishedMicros: bigint | undefined;
  readonly claimedBy: string | null;
};

type StatusRow = { readonly id: string; readonly status: string };
type TimesRow = {
  readonly status: string;
  readonly started: string | null;
  readonly finished: string | null;
  readonly claimed_by: string | null;
};

function placeholders(count: number): string {
  return Array.from({ length: count }, (_unused, index) => `$${index + 1}`).join(', ');
}

export async function readStatuses(
  context: QueueTestContext,
  runIds: readonly string[],
): Promise<StatusSnapshot> {
  const rows: unknown = await context.client.unsafe(
    `SELECT id, status FROM runs WHERE id IN (${placeholders(runIds.length)})`,
    [...runIds],
  );
  return Object.fromEntries((rows as readonly StatusRow[]).map((row) => [row.id, row.status]));
}

export async function readTimes(context: QueueTestContext, runId: string): Promise<RunTimes> {
  const rows: unknown = await context.client.unsafe(
    `SELECT status, claimed_by, (extract(epoch from started_at) * ${MICROSECONDS_PER_SECOND})::bigint::text AS started, (extract(epoch from finished_at) * ${MICROSECONDS_PER_SECOND})::bigint::text AS finished FROM runs WHERE id = $1`,
    [runId],
  );
  const row = (rows as readonly TimesRow[])[0];
  if (row === undefined) throw new Error('execução inexistente');
  return {
    status: row.status,
    claimedBy: row.claimed_by,
    startedMicros: row.started === null ? undefined : BigInt(row.started),
    finishedMicros: row.finished === null ? undefined : BigInt(row.finished),
  };
}

// Fotografa o estado das execuções a cada 25 ms até todas terminarem: é o que prova "esperou", "rodou na hora".
export async function sampleUntilFinished(
  context: QueueTestContext,
  runIds: readonly string[],
): Promise<readonly StatusSnapshot[]> {
  const snapshots: StatusSnapshot[] = [];
  const deadline = Date.now() + WAIT_TIMEOUT_MILLISECONDS;
  for (;;) {
    const snapshot = await readStatuses(context, runIds);
    snapshots.push(snapshot);
    if (runIds.every((id) => FINAL_STATUSES.includes(snapshot[id] ?? ''))) return snapshots;
    assertCondition(Date.now() < deadline, 'tempo esgotado esperando as execuções terminarem');
    await Bun.sleep(SAMPLE_PAUSE_MILLISECONDS);
  }
}

export async function waitFor(
  description: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MILLISECONDS;
  while (!(await condition())) {
    assertCondition(Date.now() < deadline, `tempo esgotado: ${description}`);
    await Bun.sleep(SAMPLE_PAUSE_MILLISECONDS);
  }
}

export function countWhere(
  snapshots: readonly StatusSnapshot[],
  predicate: (snapshot: StatusSnapshot) => boolean,
): number {
  return snapshots.filter(predicate).length;
}
