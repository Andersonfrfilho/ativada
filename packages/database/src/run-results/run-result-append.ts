// Copyright (c) 2026 Ada Technology. All rights reserved.
import { getTableColumns } from 'drizzle-orm';

import { toNullableJsonb, toJsonb } from '../jsonb.js';
import { equityPoints } from '../schema/equity-points.schema.js';
import { fills } from '../schema/fills.schema.js';
import { runCommands } from '../schema/run-commands.schema.js';
import { signals } from '../schema/signals.schema.js';
import { chunkRows } from './run-result-merge.js';
import type { WriteRequest } from './run-result-write.types.js';
import type { CommandInput, EquityPointInput, FillInput, SignalInput } from './run-result.types.js';

const SIGNAL_COLUMN_COUNT = Object.keys(getTableColumns(signals)).length;
const FILL_COLUMN_COUNT = Object.keys(getTableColumns(fills)).length;
const EQUITY_POINT_COLUMN_COUNT = Object.keys(getTableColumns(equityPoints)).length;
const COMMAND_COLUMN_COUNT = Object.keys(getTableColumns(runCommands)).length;

// Sinal, preenchimento, patrimônio e comando são imutáveis: a chave natural repetida é ignorada (ADR 0002 §b).
export async function writeSignals(request: WriteRequest<SignalInput>): Promise<number> {
  const { executor, ownerUserId, runId } = request;
  let written = 0;
  for (const chunk of chunkRows(request.rows, SIGNAL_COLUMN_COUNT)) {
    const inserted = await executor
      .insert(signals)
      .values(
        chunk.map((row) => ({
          id: Bun.randomUUIDv7(),
          userId: ownerUserId,
          runId,
          candleTime: row.candleTime,
          action: row.action,
          score: row.score,
          regime: row.regime,
          votes: toJsonb(row.votes),
          indicators: toJsonb(row.indicators),
          sentimentObservation: toNullableJsonb(row.sentimentObservation),
          reason: row.reason,
        })),
      )
      .onConflictDoNothing({ target: [signals.runId, signals.candleTime] })
      .returning({ id: signals.id });
    written += inserted.length;
  }
  return written;
}

export async function writeFills(request: WriteRequest<FillInput>): Promise<number> {
  const { executor, ownerUserId, runId } = request;
  let written = 0;
  for (const chunk of chunkRows(request.rows, FILL_COLUMN_COUNT)) {
    const inserted = await executor
      .insert(fills)
      .values(chunk.map((row) => ({ id: Bun.randomUUIDv7(), userId: ownerUserId, runId, ...row })))
      .onConflictDoNothing({ target: [fills.runId, fills.orderKey, fills.candleTime] })
      .returning({ id: fills.id });
    written += inserted.length;
  }
  return written;
}

export async function writeEquityPoints(request: WriteRequest<EquityPointInput>): Promise<number> {
  const { executor, ownerUserId, runId } = request;
  let written = 0;
  for (const chunk of chunkRows(request.rows, EQUITY_POINT_COLUMN_COUNT)) {
    const inserted = await executor
      .insert(equityPoints)
      .values(chunk.map((row) => ({ userId: ownerUserId, runId, ...row })))
      .onConflictDoNothing({ target: [equityPoints.runId, equityPoints.candleTime] })
      .returning({ candleTime: equityPoints.candleTime });
    written += inserted.length;
  }
  return written;
}

export async function writeCommands(request: WriteRequest<CommandInput>): Promise<number> {
  const { executor, ownerUserId, runId } = request;
  let written = 0;
  for (const chunk of chunkRows(request.rows, COMMAND_COLUMN_COUNT)) {
    const inserted = await executor
      .insert(runCommands)
      .values(chunk.map((row) => ({ id: Bun.randomUUIDv7(), userId: ownerUserId, runId, ...row })))
      .onConflictDoNothing({ target: [runCommands.runId, runCommands.commandId] })
      .returning({ id: runCommands.id });
    written += inserted.length;
  }
  return written;
}
