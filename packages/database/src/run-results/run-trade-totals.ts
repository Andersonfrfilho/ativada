// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { OwnerScope } from '../ownership/owner-scope.js';
import { ORDER_SIDE, POSITION_STATUS } from './run-result.constant.js';
import type { TradeTotals } from './run-chart.types.js';

export type ReadTradeTotalsRequest = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
};

type TotalsRow = Readonly<Record<string, unknown>>;

// Tudo sai do SQL como texto (`::text`); coluna ausente ou nula é `undefined`.
function readText(row: TotalsRow | undefined, key: string): string | undefined {
  const value = row?.[key];
  return typeof value === 'string' ? value : undefined;
}

function toTotals(row: TotalsRow | undefined): TradeTotals {
  return {
    closedTrades: Number(readText(row, 'closed_trades') ?? 0),
    openTrades: Number(readText(row, 'open_trades') ?? 0),
    totalPaid: readText(row, 'total_paid') ?? '0',
    totalReceived: readText(row, 'total_received') ?? '0',
    totalFees: readText(row, 'total_fees') ?? '0',
    openPaid: readText(row, 'open_paid'),
  };
}

// UMA consulta agregada, em `numeric` (exato): a conta do caixa do motor, `ceil8(notional) + taxa` na compra e
// `floor8(notional) - taxa` na venda. A junção com os preenchimentos é pela chave da posição, do mesmo dono e execução.
export async function readTradeTotals(request: ReadTradeTotalsRequest): Promise<TradeTotals> {
  const { executor, scope, runId } = request;
  const rows: unknown = await executor.execute(sql`
    SELECT
      count(*) FILTER (WHERE p.status = ${POSITION_STATUS.CLOSED})::text AS closed_trades,
      count(*) FILTER (WHERE p.status = ${POSITION_STATUS.OPEN})::text AS open_trades,
      trim_scale(coalesce(sum(ceil(b.notional * 100000000) / 100000000 + p.entry_fee)
        FILTER (WHERE p.status = ${POSITION_STATUS.CLOSED}), 0))::text AS total_paid,
      trim_scale(coalesce(sum(floor(s.notional * 100000000) / 100000000 - p.exit_fee)
        FILTER (WHERE p.status = ${POSITION_STATUS.CLOSED}), 0))::text AS total_received,
      trim_scale(coalesce(sum(p.entry_fee + p.exit_fee)
        FILTER (WHERE p.status = ${POSITION_STATUS.CLOSED}), 0))::text AS total_fees,
      trim_scale(sum(ceil(b.notional * 100000000) / 100000000 + p.entry_fee)
        FILTER (WHERE p.status = ${POSITION_STATUS.OPEN}))::text AS open_paid
    FROM positions p
    LEFT JOIN fills b ON b.user_id = p.user_id AND b.run_id = p.run_id
      AND b.position_key = p.engine_key AND b.side = ${ORDER_SIDE.BUY}
    LEFT JOIN fills s ON s.user_id = p.user_id AND s.run_id = p.run_id
      AND s.position_key = p.engine_key AND s.side = ${ORDER_SIDE.SELL}
    WHERE p.user_id = ${scope.ownerUserId} AND p.run_id = ${runId}`);
  return toTotals(Array.isArray(rows) ? (rows as readonly TotalsRow[])[0] : undefined);
}
