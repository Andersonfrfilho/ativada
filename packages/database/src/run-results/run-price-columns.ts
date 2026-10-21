// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import type { PriceColumn, PriceColumnsParams } from './run-chart.types.js';

export type ListPriceColumnsRequest = {
  readonly executor: DatabaseExecutor;
  readonly params: PriceColumnsParams;
};

type PriceColumnRow = Readonly<Record<string, unknown>>;

function toColumn(row: PriceColumnRow): PriceColumn {
  return {
    startTime: Number(row['start_time']),
    endTime: Number(row['end_time']),
    first: String(row['first_open']),
    last: String(row['last_close']),
    low: String(row['low_price']),
    high: String(row['high_price']),
  };
}

// balde = ((abertura - from) * columns) / (to - from), em bigint com divisão inteira (piso, operandos não negativos).
// Tudo parametrizado: nada do pedido vira texto de SQL. `exchange` no WHERE faz a consulta ser uma varredura de faixa da
// chave primária. `trim_scale` tira os zeros à direita, a grafia canônica do motor.
export async function listPriceColumns(
  request: ListPriceColumnsRequest,
): Promise<readonly PriceColumn[]> {
  const { exchange, symbol, timeframe, range, columns } = request.params;
  const rows: unknown = await request.executor.execute(sql`
    SELECT min(open_time)::text AS start_time, max(open_time)::text AS end_time,
      trim_scale((array_agg(open ORDER BY open_time))[1])::text AS first_open,
      trim_scale((array_agg(close ORDER BY open_time DESC))[1])::text AS last_close,
      trim_scale(min(low))::text AS low_price, trim_scale(max(high))::text AS high_price
    FROM (
      SELECT open_time, open, high, low, close,
        ((open_time - ${range.from}::bigint) * ${columns}::bigint) / (${range.to}::bigint - ${range.from}::bigint) AS bucket
      FROM candles
      WHERE exchange = ${exchange} AND symbol = ${symbol} AND timeframe = ${timeframe}
        AND open_time >= ${range.from}::bigint AND open_time < ${range.to}::bigint
    ) AS bucketed
    GROUP BY bucket ORDER BY bucket`);
  return Array.isArray(rows) ? (rows as readonly PriceColumnRow[]).map(toColumn) : [];
}
