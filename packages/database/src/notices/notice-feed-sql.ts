// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql, type SQL } from 'drizzle-orm';

import { CANDLE_TIMEFRAME_DURATION_MILLISECONDS } from '../candles/candle.constant.js';
import { ALERT_SIDE } from '../alerts/alert.constant.js';
import type { UserId } from '../ownership/user-id.js';
import { ORDER_PURPOSE, ORDER_SIDE, POSITION_STATUS } from '../run-results/run-result.constant.js';
import { RUN_KIND } from '../runs/run.constant.js';
import { NOTICE_SOURCE, type NoticeSource } from './notice-feed.types.js';

type NoticeColumn =
  | 'notice_id'
  | 'source'
  | 'occurred_at'
  | 'run_id'
  | 'symbol'
  | 'timeframe'
  | 'candle_time'
  | 'expires_candle_time'
  | 'operation_key'
  | 'state'
  | 'reason'
  | 'price'
  | 'limit_price'
  | 'order_type'
  | 'fee'
  | 'quantity'
  | 'net_profit'
  | 'target_price'
  | 'stop_price'
  | 'initial_balance';

export const NOTICE_COLUMNS: readonly NoticeColumn[] = [
  'notice_id',
  'source',
  'occurred_at',
  'run_id',
  'symbol',
  'timeframe',
  'candle_time',
  'expires_candle_time',
  'operation_key',
  'state',
  'reason',
  'price',
  'limit_price',
  'order_type',
  'fee',
  'quantity',
  'net_profit',
  'target_price',
  'stop_price',
  'initial_balance',
];

const BIGINT_COLUMNS: ReadonlySet<NoticeColumn> = new Set([
  'occurred_at',
  'candle_time',
  'expires_candle_time',
]);

type NoticeFields = Partial<Record<NoticeColumn, SQL>>;

// Todas as ramas do UNION ALL têm de ter as MESMAS colunas e tipos: o que a origem não tem vira NULL tipado.
function selectList(fields: NoticeFields): SQL {
  const columns = NOTICE_COLUMNS.map((column) => {
    const fallback = BIGINT_COLUMNS.has(column) ? sql`NULL::bigint` : sql`NULL::text`;
    return sql`${fields[column] ?? fallback} AS ${sql.raw(column)}`;
  });
  return sql.join(columns, sql`, `);
}

// A duração da vela como CASE sobre o texto do timeframe da execução (os valores são constantes do código, nunca do usuário).
const CANDLE_DURATION: SQL = sql.raw(
  `(CASE r.timeframe ${Object.entries(CANDLE_TIMEFRAME_DURATION_MILLISECONDS)
    .map(([timeframe, milliseconds]) => `WHEN '${timeframe}' THEN ${milliseconds}::bigint`)
    .join(' ')} END)`,
);

const INITIAL_BALANCE: SQL = sql`(r.run_parameters->>'initialBalance')`;

function runFields(source: NoticeSource, noticeId: SQL): NoticeFields {
  return {
    notice_id: noticeId,
    source: sql`${source}::text`,
    run_id: sql`r.id::text`,
    symbol: sql`r.symbol`,
    timeframe: sql`r.timeframe`,
    initial_balance: INITIAL_BALANCE,
  };
}

function liveRunFilter(owner: UserId): SQL {
  return sql`r.user_id = ${owner} AND r.kind = ${RUN_KIND.LIVE_PAPER} AND r.deleted_at IS NULL`;
}

export function entryOrderNotices(owner: UserId): SQL {
  const fields = {
    ...runFields(NOTICE_SOURCE.ENTRY_ORDER, sql`'order:' || o.run_id::text || ':' || o.engine_key`),
    occurred_at: sql`o.last_event_candle_time + ${CANDLE_DURATION}`,
    candle_time: sql`o.last_event_candle_time`,
    expires_candle_time: sql`o.expires_candle_time`,
    order_type: sql`o.type`,
    operation_key: sql`p.engine_key`,
    state: sql`o.status`,
    reason: sql`o.reason`,
    price: sql`f.price::text`,
    limit_price: sql`o.limit_price::text`,
    fee: sql`f.fee::text`,
    quantity: sql`f.quantity::text`,
    target_price: sql`p.target_price::text`,
    stop_price: sql`p.stop_price::text`,
  };
  return sql`SELECT ${selectList(fields)} FROM orders o
    JOIN runs r ON r.id = o.run_id AND ${liveRunFilter(owner)}
    LEFT JOIN fills f ON f.run_id = o.run_id AND f.order_key = o.engine_key AND f.user_id = ${owner}
    LEFT JOIN positions p ON p.run_id = f.run_id AND p.engine_key = f.position_key AND p.user_id = ${owner}
    WHERE o.user_id = ${owner} AND o.side = ${ORDER_SIDE.BUY} AND o.purpose = ${ORDER_PURPOSE.ENTRY}`;
}

export function exitPositionNotices(owner: UserId): SQL {
  const fields = {
    ...runFields(
      NOTICE_SOURCE.EXIT_POSITION,
      sql`'exit:' || p.run_id::text || ':' || p.engine_key`,
    ),
    occurred_at: sql`p.closed_candle_time + ${CANDLE_DURATION}`,
    candle_time: sql`p.closed_candle_time`,
    operation_key: sql`p.engine_key`,
    reason: sql`p.exit_reason`,
    price: sql`p.exit_price::text`,
    fee: sql`p.exit_fee::text`,
    quantity: sql`p.quantity::text`,
    net_profit: sql`p.net_profit::text`,
    target_price: sql`p.target_price::text`,
    stop_price: sql`p.stop_price::text`,
  };
  return sql`SELECT ${selectList(fields)} FROM positions p
    JOIN runs r ON r.id = p.run_id AND ${liveRunFilter(owner)}
    WHERE p.user_id = ${owner} AND p.status = ${POSITION_STATUS.CLOSED}`;
}

export function stalledRunNotices(owner: UserId): SQL {
  const fields = {
    ...runFields(
      NOTICE_SOURCE.RUN_STALLED,
      sql`'stalled:' || r.id::text || ':' || r.stalled_since::text`,
    ),
    occurred_at: sql`r.stalled_since`,
  };
  return sql`SELECT ${selectList(fields)} FROM runs r WHERE ${liveRunFilter(owner)} AND r.stalled_since IS NOT NULL`;
}

export function waitingRunNotices(owner: UserId): SQL {
  const fields = {
    ...runFields(
      NOTICE_SOURCE.RUN_WAITING,
      sql`'waiting:' || r.id::text || ':' || r.waiting_since::text`,
    ),
    occurred_at: sql`r.waiting_since`,
    candle_time: sql`r.waiting_open_time`,
  };
  return sql`SELECT ${selectList(fields)} FROM runs r WHERE ${liveRunFilter(owner)} AND r.waiting_since IS NOT NULL`;
}

export function goalRunNotices(owner: UserId): SQL {
  const fields = {
    ...runFields(NOTICE_SOURCE.RUN_GOAL, sql`'goal:' || r.id::text`),
    occurred_at: sql`r.goal_outcome_candle_time + ${CANDLE_DURATION}`,
    candle_time: sql`r.goal_outcome_candle_time`,
    state: sql`r.goal_outcome`,
  };
  return sql`SELECT ${selectList(fields)} FROM runs r WHERE ${liveRunFilter(owner)} AND r.goal_outcome IS NOT NULL`;
}

// A volta do ritmo só existe como aviso gravado (`alerts`, lado RESUME): o `candle_time` é o início do episódio.
export function resumedRunNotices(owner: UserId): SQL {
  const fields = {
    ...runFields(
      NOTICE_SOURCE.RUN_RESUMED,
      sql`'resumed:' || r.id::text || ':' || a.candle_time::text`,
    ),
    occurred_at: sql`(EXTRACT(EPOCH FROM a.created_at) * 1000)::bigint`,
    candle_time: sql`a.candle_time`,
  };
  return sql`SELECT ${selectList(fields)} FROM alerts a
    JOIN runs r ON r.id = a.run_id AND ${liveRunFilter(owner)}
    WHERE a.user_id = ${owner} AND a.side = ${ALERT_SIDE.RESUME}`;
}

export function firedPriceAlertNotices(owner: UserId): SQL {
  const fields = {
    notice_id: sql`'price_alert:' || pa.id::text || ':' || (EXTRACT(EPOCH FROM pa.last_fired_at) * 1000)::bigint::text`,
    source: sql`${NOTICE_SOURCE.PRICE_ALERT}::text`,
    occurred_at: sql`(EXTRACT(EPOCH FROM pa.last_fired_at) * 1000)::bigint`,
    symbol: sql`pa.symbol`,
    reason: sql`pa.direction`,
    price: sql`pa.value::text`,
  };
  return sql`SELECT ${selectList(fields)} FROM price_alerts pa
    WHERE pa.user_id = ${owner} AND pa.last_fired_at IS NOT NULL`;
}
