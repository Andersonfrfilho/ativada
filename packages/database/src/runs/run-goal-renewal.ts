// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import { RUN_KIND, RUN_STATUS } from './run.constant.js';

export type RenewGoalRunParams = {
  // A execução que acabou de concluir pela meta.
  readonly runId: string;
  readonly durationMilliseconds: number;
};

function readRenewedId(rows: unknown): string | undefined {
  if (!Array.isArray(rows)) return undefined;
  const row: unknown = rows[0];
  if (typeof row !== 'object' || row === null || !('id' in row)) return undefined;
  return typeof row.id === 'string' ? row.id : undefined;
}

// A meta se renova: a simulação que concluiu pela meta ganha uma sucessora `queued` com a mesma estratégia, os mesmos
// parâmetros e a meta ATUAL (a fotografia é refeita da linha de `goals`), começando no candle aberto agora. Meta
// desativada, apagada ou de outro par não renova: é assim que a pessoa para o ciclo. `renewedFrom` no pedido torna a
// renovação idempotente (reentregar o passo nunca cria duas sucessoras).
export async function renewGoalRun(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: RenewGoalRunParams,
): Promise<string | undefined> {
  const duration = params.durationMilliseconds;
  const rows: unknown = await executor.execute(sql`
    INSERT INTO runs (id, user_id, strategy_version_id, kind, symbol, timeframe, run_parameters, run_hash,
      engine_version, signal_engine_version, metrics_version, period_start, request, goal_id)
    SELECT ${Bun.randomUUIDv7()}::uuid, r.user_id, r.strategy_version_id, r.kind, r.symbol, r.timeframe,
      r.run_parameters, r.run_hash, r.engine_version, r.signal_engine_version, r.metrics_version,
      floor(extract(epoch FROM clock_timestamp()) * 1000 / ${duration}::bigint)::bigint * ${duration}::bigint,
      coalesce(r.request, '{}'::jsonb) || jsonb_build_object(
        'goal', jsonb_build_object('targetRate', g.target_rate::text, 'maxLossRate', g.max_loss_rate::text,
          'horizonDays', g.horizon_days),
        'renewedFrom', r.id::text),
      r.goal_id
    FROM runs r
    JOIN goals g ON g.id = r.goal_id AND g.user_id = r.user_id
    WHERE r.id = ${params.runId}::uuid AND r.user_id = ${scope.ownerUserId}::uuid
      AND r.kind = ${RUN_KIND.LIVE_PAPER} AND r.status = ${RUN_STATUS.COMPLETED} AND r.deleted_at IS NULL
      AND g.is_active AND g.symbol = r.symbol
      AND NOT EXISTS (SELECT 1 FROM runs s WHERE s.user_id = r.user_id AND s.request->>'renewedFrom' = r.id::text)
    RETURNING id`);
  return readRenewedId(rows);
}
