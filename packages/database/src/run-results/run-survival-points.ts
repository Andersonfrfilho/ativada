// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { SurvivalPointInput, SurvivalPointsParams } from './run-result.types.js';

export type ListSurvivalPointsRequest = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly params: SurvivalPointsParams;
};

type SurvivalRow = Readonly<Record<string, unknown>>;

// O ORDER BY nomeia a tabela: o alias `::text` das colunas de saída ordenaria por texto, não por número.
// Cada candidato é UMA linha escolhida pelo banco (sem trazer a série): quem decide o marco é a linha, e a função pura do
// motor vê só ela. Os pontos antes do início são aquecimento e nunca entram.
function candidate(request: ListSurvivalPointsRequest, selection: SQL): SQL {
  const { scope, runId, params } = request;
  return sql`(SELECT candle_time, equity::text AS equity, equity_at_low::text AS equity_at_low
    FROM equity_points
    WHERE user_id = ${scope.ownerUserId} AND run_id = ${runId} AND candle_time >= ${params.startTime}${selection})`;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function toPoint(row: SurvivalRow): SurvivalPointInput {
  return {
    candleTime: readNumber(row['candle_time']),
    equity: String(row['equity']),
    equityAtLow: String(row['equity_at_low']),
  };
}

// Os cinco pontos que bastam à varredura da sobrevivência do saldo: o primeiro que toca o piso (vale <= piso), o primeiro que
// alcança a meta (fechamento >= meta), o vale mais fundo, o fechamento mais alto e o último. Reunidos em ordem de candle,
// a função pura dá o mesmo resultado que daria sobre a série inteira, e a leitura nunca passa de cinco linhas.
export async function listSurvivalPoints(
  request: ListSurvivalPointsRequest,
): Promise<readonly SurvivalPointInput[]> {
  const { params } = request;
  const candidates = sql.join(
    [
      candidate(
        request,
        sql` AND equity_at_low <= ${params.floorLevel}::numeric ORDER BY candle_time LIMIT 1`,
      ),
      candidate(
        request,
        sql` AND equity >= ${params.targetLevel}::numeric ORDER BY candle_time LIMIT 1`,
      ),
      candidate(request, sql` ORDER BY equity_points.equity_at_low, candle_time LIMIT 1`),
      candidate(request, sql` ORDER BY equity_points.equity DESC, candle_time LIMIT 1`),
      candidate(request, sql` ORDER BY candle_time DESC LIMIT 1`),
    ],
    sql` UNION `,
  );
  const rows: unknown = await request.executor.execute(
    sql`SELECT candle_time, equity, equity_at_low FROM (${candidates}) AS survival ORDER BY candle_time`,
  );
  return Array.isArray(rows) ? (rows as readonly SurvivalRow[]).map(toPoint) : [];
}
