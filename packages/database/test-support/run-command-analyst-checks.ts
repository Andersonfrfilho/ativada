// Copyright (c) 2026 Ada Technology. All rights reserved.
import { join } from 'node:path';

import { MIGRATIONS_FOLDER } from '../src/database.constant.js';
import { readPostgresErrorCode, RESTRICT_VIOLATION_SQLSTATE } from '../src/postgres-error-code.js';
import {
  COMMAND_KIND,
  COMMAND_REASON,
  COMMAND_STATUS,
} from '../src/run-results/run-result.constant.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  candleTimeAt,
  captureErrorCode,
  resolvePersistenceOwner,
  seedRun,
} from './persistence-seed.js';

const CHECK_VIOLATION = '23514';
const ROLLBACK_FILE = '0025_run_commands_analyst.rollback.sql';

type ReasonRow = { readonly reason: string };

async function runRollback(client: Bun.SQL): Promise<string | undefined> {
  const script = await Bun.file(join(MIGRATIONS_FOLDER, ROLLBACK_FILE)).text();
  try {
    await client.begin(async (transaction) => {
      await transaction.unsafe(script);
    });
    return undefined;
  } catch (error: unknown) {
    return readPostgresErrorCode(error);
  }
}

function insertCommand(
  context: LifecycleCheckContext,
  target: { readonly userId: string; readonly runId: string },
  params: { readonly commandId: string; readonly reason: string },
): Promise<unknown> {
  return context.client`INSERT INTO run_commands (id, user_id, run_id, command_id, kind, reason, issued_at, candle_time, status) VALUES (${Bun.randomUUIDv7()}, ${target.userId}, ${target.runId}, ${params.commandId}, 'exit_position', ${params.reason}, 1, 1, 'applied')`;
}

// Spec 007 (A21): a saída por tempo do analista entra na trilha; o rollback da 0025 nunca apaga essa trilha.
export async function checkAnalystCommandReason(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-analyst-command');
  const run = await seedRun(handle, owner);
  const target = { userId: owner.userId, runId: run.id };
  const written = await createRunResultRepository(handle).appendCommands(owner.scope, run.id, [
    {
      commandId: `analyst:${candleTimeAt(4)}:exit_position`,
      kind: COMMAND_KIND.EXIT_POSITION,
      reason: COMMAND_REASON.ANALYST_TIMEOUT,
      issuedAt: candleTimeAt(4),
      candleTime: candleTimeAt(4),
      status: COMMAND_STATUS.APPLIED,
    },
  ]);
  const rows: unknown = await client`SELECT reason FROM run_commands WHERE run_id = ${run.id}`;
  assertCondition(
    written?.written === 1 && (rows as readonly ReasonRow[])[0]?.reason === 'analyst_timeout',
    'run_commands grava o motivo analyst_timeout',
  );
  const unknown = await captureErrorCode(
    insertCommand(context, target, { commandId: 'pause', reason: 'analyst_pause' }),
  );
  assertCondition(unknown === CHECK_VIOLATION, `motivo fora do catálogo -> ${String(unknown)}`);
  const refused = await runRollback(client);
  assertCondition(
    refused === RESTRICT_VIOLATION_SQLSTATE,
    `rollback da 0025 com trilha do analista -> ${String(refused)}`,
  );
  const after = await captureErrorCode(
    insertCommand(context, target, { commandId: 'timeout-2', reason: 'analyst_timeout' }),
  );
  assertCondition(after === undefined, `o CHECK continuou com analyst_timeout -> ${String(after)}`);
  reportCheck(
    'run_commands: analyst_timeout gravado, motivo fora do catálogo barrado e o rollback da 0025 aborta sem apagar a trilha',
  );
}
