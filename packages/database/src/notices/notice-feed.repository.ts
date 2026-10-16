// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import { NOTICE_FEED_MAXIMUM_LIMIT } from './notice-feed.constant.js';
import type { UserId } from '../ownership/user-id.js';
import {
  NOTICE_FEED_SCOPE,
  type NoticeFeedScope,
  NOTICE_SOURCE,
  type ListNoticeSourcesParams,
  type NoticeFeedRepository,
  type NoticeSource,
  type NoticeSourceRow,
} from './notice-feed.types.js';
import {
  entryOrderNotices,
  firedPriceAlertNotices,
  goalRunNotices,
  resumedRunNotices,
  stalledRunNotices,
  waitingRunNotices,
  exitPositionNotices,
} from './notice-feed-sql.js';

type RawRow = Readonly<Record<string, unknown>>;

function readText(row: RawRow, column: string): string | undefined {
  const value = row[column];
  return typeof value === 'string' ? value : undefined;
}

// O bigint do Postgres chega como texto; os instantes cabem com folga em um inteiro seguro do JavaScript.
function readMilliseconds(row: RawRow, column: string): number | undefined {
  const value = row[column];
  if (typeof value === 'number') return value;
  return typeof value === 'string' ? Number(value) : undefined;
}

function toSource(value: string | undefined): NoticeSource {
  const source = Object.values(NOTICE_SOURCE).find((candidate) => candidate === value);
  if (source === undefined) throw new Error('Origem de aviso gravada desconhecida.');
  return source;
}

function toNoticeRow(row: RawRow): NoticeSourceRow {
  return {
    noticeId: readText(row, 'notice_id') ?? '',
    source: toSource(readText(row, 'source')),
    occurredAt: readMilliseconds(row, 'occurred_at') ?? 0,
    runId: readText(row, 'run_id'),
    symbol: readText(row, 'symbol') ?? '',
    timeframe: readText(row, 'timeframe'),
    candleTime: readMilliseconds(row, 'candle_time'),
    expiresCandleTime: readMilliseconds(row, 'expires_candle_time'),
    operationKey: readText(row, 'operation_key'),
    state: readText(row, 'state'),
    reason: readText(row, 'reason'),
    price: readText(row, 'price'),
    limitPrice: readText(row, 'limit_price'),
    orderType: readText(row, 'order_type'),
    fee: readText(row, 'fee'),
    quantity: readText(row, 'quantity'),
    netProfit: readText(row, 'net_profit'),
    targetPrice: readText(row, 'target_price'),
    entryPrice: readText(row, 'entry_price'),
    stopPrice: readText(row, 'stop_price'),
    initialBalance: readText(row, 'initial_balance'),
  };
}

function cursorCondition(params: ListNoticeSourcesParams): SQL {
  const { older, newer } = params;
  const parts: SQL[] = [sql`occurred_at >= ${params.since}::bigint`];
  if (older !== undefined) {
    parts.push(
      sql`(occurred_at, notice_id) < (${older.occurredAt}::bigint, ${older.noticeId}::text)`,
    );
  }
  if (newer !== undefined) {
    parts.push(
      sql`(occurred_at, notice_id) > (${newer.occurredAt}::bigint, ${newer.noticeId}::text)`,
    );
  }
  return sql.join(parts, sql` AND `);
}

function selectBranches(owner: UserId, scope: NoticeFeedScope): SQL[] {
  if (scope === NOTICE_FEED_SCOPE.PRICE_ALERTS) return [firedPriceAlertNotices(owner)];
  const runBranches = [
    entryOrderNotices(owner),
    exitPositionNotices(owner),
    stalledRunNotices(owner),
    waitingRunNotices(owner),
    goalRunNotices(owner),
    resumedRunNotices(owner),
  ];
  return scope === NOTICE_FEED_SCOPE.RUNS
    ? runBranches
    : [...runBranches, firedPriceAlertNotices(owner)];
}

// A lista decrescente de avisos do dono: UMA consulta, o dono em cada tabela de cada ramo, janela de tempo e LIMIT.
export async function listNoticeSources(
  database: DatabaseExecutor,
  scope: OwnerScope,
  params: ListNoticeSourcesParams,
): Promise<readonly NoticeSourceRow[]> {
  const owner = scope.ownerUserId;
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), NOTICE_FEED_MAXIMUM_LIMIT);
  const union = sql.join(selectBranches(owner, params.scope), sql` UNION ALL `);
  const rows: unknown = await database.execute(
    sql`SELECT * FROM (${union}) AS notices WHERE ${cursorCondition(params)}
      ORDER BY occurred_at DESC, notice_id DESC LIMIT ${limit}`,
  );
  return (Array.isArray(rows) ? (rows as readonly RawRow[]) : []).map(toNoticeRow);
}

export function createNoticeFeedRepository(handle: DatabaseHandle): NoticeFeedRepository {
  const { database } = readOpenDatabase(handle);
  return { listNoticeSources: (scope, params) => listNoticeSources(database, scope, params) };
}
