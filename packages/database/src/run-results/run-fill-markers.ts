// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { fills } from '../schema/fills.schema.js';
import { positions } from '../schema/positions.schema.js';
import type {
  FillClusterBucket,
  FillClustersParams,
  FillCounts,
  FillMarkerInput,
  FillMarkersParams,
} from './run-chart.types.js';
import { ORDER_SIDE } from './run-result.constant.js';
import { toFillInput } from './run-result-record.mapper.js';
import type { TimeRange } from './run-result.types.js';

type RunRequest<TParams> = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly params: TParams;
};

function fillsInRange(request: RunRequest<TimeRange>): ReturnType<typeof and> {
  const { scope, runId, params } = request;
  return and(
    ownerCondition(scope, fills.userId),
    eq(fills.runId, runId),
    gte(fills.candleTime, params.from),
    lt(fills.candleTime, params.to),
  );
}

// Só a venda carrega o resultado da posição (junção por chave da posição, do mesmo dono); ordem de tempo e depois de ordem.
export async function listFillMarkers(
  request: RunRequest<FillMarkersParams>,
): Promise<readonly FillMarkerInput[]> {
  const { executor, params } = request;
  const rows = await executor
    .select({ fill: fills, netProfit: positions.netProfit })
    .from(fills)
    .leftJoin(
      positions,
      and(
        eq(positions.userId, fills.userId),
        eq(positions.runId, fills.runId),
        eq(positions.engineKey, fills.positionKey),
      ),
    )
    .where(fillsInRange({ ...request, params: params.range }))
    .orderBy(asc(fills.candleTime), asc(fills.orderKey))
    .limit(params.limit);
  return rows.map((row) => ({
    ...toFillInput(row.fill),
    netProfit:
      row.fill.side === ORDER_SIDE.SELL && row.netProfit !== null ? row.netProfit : undefined,
  }));
}

export async function countFillsInRange(request: RunRequest<TimeRange>): Promise<FillCounts> {
  const rows = await request.executor
    .select({
      buys: sql<string>`count(*) filter (where ${fills.side} = ${ORDER_SIDE.BUY})`,
      sells: sql<string>`count(*) filter (where ${fills.side} = ${ORDER_SIDE.SELL})`,
    })
    .from(fills)
    .where(fillsInRange(request));
  return { buys: Number(rows[0]?.buys ?? 0), sells: Number(rows[0]?.sells ?? 0) };
}

type ClusterRow = Readonly<Record<string, unknown>>;

// O mesmo balde do preço (bigint, divisão inteira) aplicado a `candle_time`; só devolve os baldes com preenchimento. O ORDER BY
// nomeia a tabela: o alias `::text` da saída ordenaria por texto (10 antes de 2), não por número.
export async function listFillClusters(
  request: RunRequest<FillClustersParams>,
): Promise<readonly FillClusterBucket[]> {
  const { executor, scope, runId, params } = request;
  const { from, to } = params.range;
  const rows: unknown = await executor.execute(sql`
    SELECT bucket::text AS bucket,
      count(*) FILTER (WHERE side = ${ORDER_SIDE.BUY})::text AS buys,
      count(*) FILTER (WHERE side = ${ORDER_SIDE.SELL})::text AS sells
    FROM (
      SELECT side, ((candle_time - ${from}::bigint) * ${params.columns}::bigint) / (${to}::bigint - ${from}::bigint) AS bucket
      FROM fills
      WHERE user_id = ${scope.ownerUserId} AND run_id = ${runId}
        AND candle_time >= ${from}::bigint AND candle_time < ${to}::bigint
    ) AS bucketed
    GROUP BY bucketed.bucket ORDER BY bucketed.bucket`);
  if (!Array.isArray(rows)) return [];
  return (rows as readonly ClusterRow[]).map((row) => ({
    bucket: Number(row['bucket']),
    buys: Number(row['buys']),
    sells: Number(row['sells']),
  }));
}
