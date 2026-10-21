// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import { POSITION_STATUS } from '../run-results/run-result.constant.js';

// O que a meta somada do analista lê da execução: o último patrimônio gravado e quantas operações já fecharam.
export type AnalystGoalSnapshot = {
  readonly latestEquity: string | undefined;
  readonly closedPositions: number;
};

type SnapshotRow = Readonly<Record<string, unknown>>;

function toSnapshot(row: SnapshotRow | undefined): AnalystGoalSnapshot {
  const equity = row?.['latest_equity'];
  const closed = row?.['closed_positions'];
  return {
    latestEquity: typeof equity === 'string' ? equity : undefined,
    closedPositions: typeof closed === 'string' ? Number(closed) : 0,
  };
}

// UMA consulta com duas leituras por chave (a PK de `equity_points` de trás para a frente e a contagem de `positions` da
// execução): o último patrimônio e o número de operações fechadas, sempre presas ao dono.
export async function readAnalystGoalSnapshot(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  runId: string,
): Promise<AnalystGoalSnapshot> {
  const rows: unknown = await executor.execute(sql`
    SELECT
      (SELECT e.equity::text FROM equity_points e
        WHERE e.user_id = ${scope.ownerUserId} AND e.run_id = ${runId}
        ORDER BY e.candle_time DESC LIMIT 1) AS latest_equity,
      (SELECT count(*) FROM positions p
        WHERE p.user_id = ${scope.ownerUserId} AND p.run_id = ${runId}
          AND p.status = ${POSITION_STATUS.CLOSED})::text AS closed_positions`);
  return toSnapshot(Array.isArray(rows) ? (rows as readonly SnapshotRow[])[0] : undefined);
}
