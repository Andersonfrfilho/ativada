// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql, type SQL } from 'drizzle-orm';

import { ALERT_SIDE } from '../alerts/alert.constant.js';
import type { UserId } from '../ownership/user-id.js';
import { NOTICE_SOURCE } from './notice-feed.types.js';
import { CANDLE_DURATION, liveRunFilter, runFields, selectList } from './notice-feed-sql.js';

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
