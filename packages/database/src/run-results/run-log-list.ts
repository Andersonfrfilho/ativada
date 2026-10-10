// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql, type SQL } from 'drizzle-orm';

import type { UserId } from '../ownership/user-id.js';
import { clampLimit, toPage, type ListRequest } from './run-result-list.js';
import { RUN_LOG_KIND, RUN_LOG_RANK, type RunLogKind } from './run-log.constant.js';
import type { RunLogCursor, RunLogEntry } from './run-log.types.js';
import type { ResultPage } from './run-result.types.js';

type LogColumn =
  | 'event_time'
  | 'event_rank'
  | 'entry_key'
  | 'kind'
  | 'action'
  | 'side'
  | 'order_key'
  | 'order_type'
  | 'purpose'
  | 'status'
  | 'score'
  | 'regime'
  | 'price'
  | 'limit_price'
  | 'trigger_price'
  | 'quantity'
  | 'notional'
  | 'fee'
  | 'risk_amount'
  | 'stop_distance'
  | 'target_distance'
  | 'last_event_time'
  | 'reason';

const LOG_COLUMNS: readonly LogColumn[] = [
  'event_time',
  'event_rank',
  'entry_key',
  'kind',
  'action',
  'side',
  'order_key',
  'order_type',
  'purpose',
  'status',
  'score',
  'regime',
  'price',
  'limit_price',
  'trigger_price',
  'quantity',
  'notional',
  'fee',
  'risk_amount',
  'stop_distance',
  'target_distance',
  'last_event_time',
  'reason',
];

const NULL_BIGINT = sql`NULL::bigint`;
const NULL_TEXT = sql`NULL::text`;

// As três consultas têm de produzir as MESMAS colunas, nos mesmos tipos, para o UNION ALL; o que o tipo não tem vira NULL.
function selectList(fields: Partial<Record<LogColumn, SQL>>): SQL {
  const columns = LOG_COLUMNS.map((column) => {
    const fallback = column === 'last_event_time' ? NULL_BIGINT : NULL_TEXT;
    return sql`${fields[column] ?? fallback} AS ${sql.raw(column)}`;
  });
  return sql.join(columns, sql`, `);
}

function kindFields(kind: RunLogKind, key: SQL): Partial<Record<LogColumn, SQL>> {
  return { event_rank: sql`${RUN_LOG_RANK[kind]}::int`, entry_key: key, kind: sql`${kind}::text` };
}

function signalEvents(owner: UserId, runId: string): SQL {
  const fields = {
    ...kindFields(RUN_LOG_KIND.SIGNAL, sql`''::text`),
    event_time: sql`candle_time`,
    action: sql`action`,
    score: sql`score::text`,
    regime: sql`regime`,
    reason: sql`reason`,
  };
  return sql`SELECT ${selectList(fields)} FROM signals WHERE user_id = ${owner} AND run_id = ${runId}`;
}

function orderEvents(owner: UserId, runId: string): SQL {
  const fields = {
    ...kindFields(RUN_LOG_KIND.ORDER, sql`engine_key`),
    event_time: sql`created_candle_time`,
    side: sql`side`,
    order_key: sql`engine_key`,
    order_type: sql`type`,
    purpose: sql`purpose`,
    status: sql`status`,
    price: sql`price::text`,
    limit_price: sql`limit_price::text`,
    trigger_price: sql`trigger_price::text`,
    quantity: sql`quantity::text`,
    risk_amount: sql`risk_amount::text`,
    stop_distance: sql`stop_distance::text`,
    target_distance: sql`target_distance::text`,
    last_event_time: sql`last_event_candle_time`,
    reason: sql`reason`,
  };
  return sql`SELECT ${selectList(fields)} FROM orders WHERE user_id = ${owner} AND run_id = ${runId}`;
}

function fillEvents(owner: UserId, runId: string): SQL {
  const fields = {
    ...kindFields(RUN_LOG_KIND.FILL, sql`order_key`),
    event_time: sql`candle_time`,
    side: sql`side`,
    order_key: sql`order_key`,
    price: sql`price::text`,
    quantity: sql`quantity::text`,
    notional: sql`notional::text`,
    fee: sql`fee::text`,
  };
  return sql`SELECT ${selectList(fields)} FROM fills WHERE user_id = ${owner} AND run_id = ${runId}`;
}

function afterCursor(after: RunLogCursor | undefined): SQL {
  if (after === undefined) return sql``;
  return sql`WHERE (event_time, event_rank, entry_key) > (${after.eventTime}::bigint, ${after.rank}::int, ${after.key}::text)`;
}

type LogRow = Readonly<Record<string, unknown>>;

function readText(row: LogRow, column: LogColumn): string | undefined {
  const value = row[column];
  return typeof value === 'string' ? value : undefined;
}

// O bigint do Postgres chega como texto; os instantes de candle cabem com folga em um inteiro seguro do JavaScript.
function readMilliseconds(row: LogRow, column: LogColumn): number | undefined {
  const value = row[column];
  if (typeof value === 'number') return value;
  return typeof value === 'string' ? Number(value) : undefined;
}

function toEntry(row: LogRow): RunLogEntry {
  return {
    kind: readText(row, 'kind') as RunLogKind,
    eventTime: readMilliseconds(row, 'event_time') ?? 0,
    action: readText(row, 'action'),
    side: readText(row, 'side'),
    orderKey: readText(row, 'order_key'),
    orderType: readText(row, 'order_type'),
    purpose: readText(row, 'purpose'),
    status: readText(row, 'status'),
    score: readText(row, 'score'),
    regime: readText(row, 'regime'),
    price: readText(row, 'price'),
    limitPrice: readText(row, 'limit_price'),
    triggerPrice: readText(row, 'trigger_price'),
    quantity: readText(row, 'quantity'),
    notional: readText(row, 'notional'),
    fee: readText(row, 'fee'),
    riskAmount: readText(row, 'risk_amount'),
    stopDistance: readText(row, 'stop_distance'),
    targetDistance: readText(row, 'target_distance'),
    lastEventTime: readMilliseconds(row, 'last_event_time'),
    reason: readText(row, 'reason'),
  };
}

function cursorOf(row: LogRow): RunLogCursor {
  return {
    eventTime: readMilliseconds(row, 'event_time') ?? 0,
    rank: Number(row['event_rank']),
    key: readText(row, 'entry_key') ?? '',
  };
}

// Sinais, ordens e preenchimentos da execução NUMA ordem só (candle, posição do tipo, chave), por cursor: o CSV do
// registro lê uma página por vez, nunca a história inteira. O dono entra em cada uma das três consultas.
export async function listRunLog(
  request: ListRequest<RunLogCursor>,
): Promise<ResultPage<RunLogEntry, RunLogCursor>> {
  const { executor, scope, runId, params } = request;
  const limit = clampLimit(params.limit);
  const owner = scope.ownerUserId;
  const union = sql.join(
    [signalEvents(owner, runId), orderEvents(owner, runId), fillEvents(owner, runId)],
    sql` UNION ALL `,
  );
  const rows: unknown = await executor.execute(
    sql`SELECT * FROM (${union}) AS run_log ${afterCursor(params.after)}
      ORDER BY event_time, event_rank, entry_key LIMIT ${limit + 1}`,
  );
  const list = Array.isArray(rows) ? (rows as readonly LogRow[]) : [];
  return toPage(list, limit, { toItem: toEntry, cursorOf });
}
