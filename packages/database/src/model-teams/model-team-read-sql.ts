// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql, type SQL } from 'drizzle-orm';

import {
  CANDLE_DURATION_15M_MILLISECONDS,
  MODEL_TEAM_PROMPT_VERSIONS,
  MODEL_TEAM_REPORT_KIND,
  MODEL_TEAM_REPORT_STATUS,
  MODEL_TEAM_TIMEFRAMES,
} from './model-team.constant.js';
import type { ReadOverviewParams } from './model-team-read.types.js';

export const [PROMPT_VERSION] = MODEL_TEAM_PROMPT_VERSIONS;
export const [TIMEFRAME] = MODEL_TEAM_TIMEFRAMES;
// Os preços saem em texto exato (`numeric::text`); o custo também.
export const REPORT_COLUMNS = sql`r.id, r.team_key, r.kind, r.candle_time, r.status, r.failure_code, r.action,
  r.entry_price::text AS entry_price, r.target_price::text AS target_price, r.stop_price::text AS stop_price,
  r.confidence, r.roles, r.reason_hidden, r.latency_ms, r.cost_usd::text AS cost_usd, r.requested_at, r.decided_at`;

// Cada seção vira uma lista jsonb (vazia, nunca nula): a consulta única devolve um documento só.
export function asList(query: SQL): SQL {
  return sql`COALESCE((SELECT jsonb_agg(to_jsonb(section)) FROM (${query}) section), '[]'::jsonb)`;
}

export function latestSection(params: ReadOverviewParams): SQL {
  return sql`
    SELECT ${REPORT_COLUMNS} FROM (
      SELECT *, row_number() OVER (PARTITION BY team_key ORDER BY candle_time DESC) AS position
      FROM model_team_reports
      WHERE symbol = ${params.symbol} AND timeframe = ${TIMEFRAME} AND prompt_version = ${PROMPT_VERSION}
        AND kind = ${MODEL_TEAM_REPORT_KIND.SCHEDULED} AND status <> ${MODEL_TEAM_REPORT_STATUS.PENDING}
    ) r WHERE r.position <= ${params.limitPerTeam}
    ORDER BY r.candle_time DESC, r.team_key`;
}

export function onDemandSection(params: ReadOverviewParams): SQL {
  if (params.onDemandIds.length === 0)
    return sql`SELECT ${REPORT_COLUMNS} FROM model_team_reports r WHERE false`;
  const ids = sql.join(
    params.onDemandIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  return sql`
    SELECT ${REPORT_COLUMNS} FROM model_team_reports r
    WHERE r.symbol = ${params.symbol} AND r.kind = ${MODEL_TEAM_REPORT_KIND.ON_DEMAND} AND r.id IN (${ids})
    ORDER BY r.requested_at DESC`;
}

// A vela decidida ⋈ o fechamento dela ⋈ o da vela seguinte (`LEAD` por junção). `buy` acerta se subiu, `sell` se desceu; empate e
// vela seguinte ainda não gravada não contam. O veredito (Wilson) sai em TypeScript.
export function scoreSection(params: ReadOverviewParams): SQL {
  return sql`
    SELECT r.team_key,
      count(*) FILTER (WHERE (r.action = 'buy' AND n.close > c.close) OR (r.action = 'sell' AND n.close < c.close))::int AS hits,
      count(*) FILTER (WHERE (r.action = 'buy' AND n.close < c.close) OR (r.action = 'sell' AND n.close > c.close))::int AS misses,
      count(*) FILTER (WHERE n.close = c.close)::int AS ties
    FROM model_team_reports r
    JOIN candles c ON c.exchange = ${params.exchange} AND c.symbol = r.symbol AND c.timeframe = ${TIMEFRAME} AND c.open_time = r.candle_time
    JOIN candles n ON n.exchange = ${params.exchange} AND n.symbol = r.symbol AND n.timeframe = ${TIMEFRAME}
      AND n.open_time = r.candle_time + ${CANDLE_DURATION_15M_MILLISECONDS}
    WHERE r.symbol = ${params.symbol} AND r.kind = ${MODEL_TEAM_REPORT_KIND.SCHEDULED}
      AND r.status = ${MODEL_TEAM_REPORT_STATUS.DECIDED} AND r.action IN ('buy', 'sell')
      AND r.prompt_version = ${PROMPT_VERSION}
      AND r.requested_at >= now() - make_interval(days => ${params.scoreboardDays})
    GROUP BY r.team_key ORDER BY r.team_key`;
}

export function spendSection(): SQL {
  return sql`
    SELECT team_key,
      COALESCE(SUM(cost_usd + reserved_usd) FILTER (WHERE requested_day = (now() AT TIME ZONE 'UTC')::date), 0)::text AS day_usd,
      COALESCE(SUM(cost_usd + reserved_usd), 0)::text AS month_usd
    FROM model_team_reports
    WHERE requested_day >= date_trunc('month', now() AT TIME ZONE 'UTC')::date
    GROUP BY team_key ORDER BY team_key`;
}

export function failureSection(params: ReadOverviewParams): SQL {
  return sql`
    SELECT team_key, count(*)::int AS total,
      count(*) FILTER (WHERE status IN ('failed', 'skipped'))::int AS failed
    FROM model_team_reports
    WHERE symbol = ${params.symbol} AND status <> ${MODEL_TEAM_REPORT_STATUS.PENDING}
      AND requested_at >= now() - make_interval(hours => ${params.failureHours})
    GROUP BY team_key ORDER BY team_key`;
}
