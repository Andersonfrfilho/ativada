// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import { RUN_KIND, RUN_STATUS } from '../runs/run.constant.js';
import { ORDER_SIDE } from './run-result.constant.js';
import type { LiveRunSummaryRow } from './run-live-status.types.js';

// Teto das simulações ao vivo ativas por conta, com folga: a lista nunca precisa de página.
export const LIVE_SUMMARY_MAXIMUM = 100;

type SummaryRow = Readonly<Record<string, unknown>>;

function readText(row: SummaryRow, key: string): string | undefined {
  const value = row[key];
  return typeof value === 'string' ? value : undefined;
}

function readRequiredText(row: SummaryRow, key: string): string {
  const value = readText(row, key);
  if (value === undefined) throw new Error('Resumo de simulação ao vivo sem um campo obrigatório.');
  return value;
}

function readNumber(row: SummaryRow, key: string): number | undefined {
  const value = readText(row, key);
  return value === undefined ? undefined : Number(value);
}

function toSummary(row: SummaryRow): LiveRunSummaryRow {
  return {
    runId: readRequiredText(row, 'run_id'),
    strategyName: readRequiredText(row, 'strategy_name'),
    timeframe: readRequiredText(row, 'timeframe'),
    analystMode: readText(row, 'analyst_mode'),
    initialBalance: readRequiredText(row, 'initial_balance'),
    latestEquity: readText(row, 'latest_equity'),
    latestBenchmark: readText(row, 'latest_benchmark'),
    buyCount: readNumber(row, 'buy_count') ?? 0,
    sellCount: readNumber(row, 'sell_count') ?? 0,
    lastDecisionCandleTime: readNumber(row, 'last_decision_candle_time'),
    isWaitingForData: readText(row, 'waiting_since') !== undefined,
  };
}

// As simulações ao vivo ativas (na fila ou rodando) do dono numa consulta só, da mais recente para a mais antiga: o último
// ponto do saldo por junção lateral pela PK, as compras e vendas por contagem dos preenchimentos e a última decisão pelo
// índice de `signals`. Cada tabela filtra o dono nela mesma; sem uma ida ao servidor por simulação.
export async function listLiveSummaries(
  executor: DatabaseExecutor,
  scope: OwnerScope,
): Promise<readonly LiveRunSummaryRow[]> {
  const rows: unknown = await executor.execute(sql`
    SELECT
      r.id::text AS run_id,
      s.name AS strategy_name,
      r.timeframe AS timeframe,
      r.request #>> '{analyst,mode}' AS analyst_mode,
      r.run_parameters ->> 'initialBalance' AS initial_balance,
      e.equity::text AS latest_equity,
      e.benchmark::text AS latest_benchmark,
      (SELECT count(*) FROM fills f WHERE f.user_id = r.user_id AND f.run_id = r.id
        AND f.side = ${ORDER_SIDE.BUY})::text AS buy_count,
      (SELECT count(*) FROM fills f WHERE f.user_id = r.user_id AND f.run_id = r.id
        AND f.side = ${ORDER_SIDE.SELL})::text AS sell_count,
      (SELECT max(g.candle_time) FROM signals g WHERE g.user_id = r.user_id
        AND g.run_id = r.id)::text AS last_decision_candle_time,
      r.waiting_since::text AS waiting_since
    FROM runs r
    JOIN strategy_versions v ON v.id = r.strategy_version_id AND v.user_id = r.user_id
    JOIN strategies s ON s.id = v.strategy_id AND s.user_id = v.user_id
    LEFT JOIN LATERAL (
      SELECT p.equity, p.benchmark FROM equity_points p
      WHERE p.user_id = r.user_id AND p.run_id = r.id
      ORDER BY p.candle_time DESC LIMIT 1
    ) e ON true
    WHERE r.user_id = ${scope.ownerUserId}
      AND r.kind = ${RUN_KIND.LIVE_PAPER}
      AND r.status IN (${RUN_STATUS.QUEUED}, ${RUN_STATUS.RUNNING})
      AND r.deleted_at IS NULL
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${LIVE_SUMMARY_MAXIMUM}`);
  return Array.isArray(rows) ? (rows as readonly SummaryRow[]).map(toSummary) : [];
}
