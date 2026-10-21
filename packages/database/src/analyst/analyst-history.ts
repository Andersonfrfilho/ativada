// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, desc, eq, gte, isNotNull, isNull, or } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { equityPoints } from '../schema/equity-points.schema.js';
import { positions } from '../schema/positions.schema.js';
import { signals } from '../schema/signals.schema.js';

const LAST_CLOSED_POSITIONS = 3;

const POSITION_COLUMNS = {
  engineKey: positions.engineKey,
  openedCandleTime: positions.openedCandleTime,
  closedCandleTime: positions.closedCandleTime,
  netProfit: positions.netProfit,
} as const;

export type AnalystHistoryPosition = {
  readonly engineKey: string;
  readonly openedCandleTime: number;
  readonly closedCandleTime: number | null;
  readonly netProfit: string | null;
};

// O que o analista lê da PRÓPRIA simulação: a pontuação do placar (a tendência da estratégia), o patrimônio e as posições.
export type AnalystHistory = {
  readonly scores: readonly { readonly candleTime: number; readonly score: string }[];
  readonly equities: readonly { readonly candleTime: number; readonly equity: string }[];
  readonly positions: readonly AnalystHistoryPosition[];
};

export type ReadAnalystHistoryParams = {
  readonly runId: string;
  // Placar e patrimônio a partir desta vela (incluída); posições: as abertas, as fechadas desde ela e as 3 últimas fechadas.
  readonly fromCandleTime: number;
};

type Read = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly params: ReadAnalystHistoryParams;
};

function readScores({ executor, scope, params }: Read): Promise<AnalystHistory['scores']> {
  return executor
    .select({ candleTime: signals.candleTime, score: signals.score })
    .from(signals)
    .where(
      and(
        ownerCondition(scope, signals.userId),
        eq(signals.runId, params.runId),
        gte(signals.candleTime, params.fromCandleTime),
      ),
    );
}

function readEquities({ executor, scope, params }: Read): Promise<AnalystHistory['equities']> {
  return executor
    .select({ candleTime: equityPoints.candleTime, equity: equityPoints.equity })
    .from(equityPoints)
    .where(
      and(
        ownerCondition(scope, equityPoints.userId),
        eq(equityPoints.runId, params.runId),
        gte(equityPoints.candleTime, params.fromCandleTime),
      ),
    );
}

async function readPositions({
  executor,
  scope,
  params,
}: Read): Promise<readonly AnalystHistoryPosition[]> {
  const owned = and(ownerCondition(scope, positions.userId), eq(positions.runId, params.runId));
  const [recent, lastClosed] = await Promise.all([
    executor
      .select(POSITION_COLUMNS)
      .from(positions)
      .where(
        and(
          owned,
          or(
            isNull(positions.closedCandleTime),
            gte(positions.closedCandleTime, params.fromCandleTime),
          ),
        ),
      ),
    executor
      .select(POSITION_COLUMNS)
      .from(positions)
      .where(and(owned, isNotNull(positions.closedCandleTime)))
      .orderBy(desc(positions.closedCandleTime))
      .limit(LAST_CLOSED_POSITIONS),
  ]);
  return [...new Map([...recent, ...lastClosed].map((row) => [row.engineKey, row])).values()];
}

export async function readAnalystHistory(
  executor: DatabaseExecutor,
  scope: OwnerScope,
  params: ReadAnalystHistoryParams,
): Promise<AnalystHistory> {
  const read: Read = { executor, scope, params };
  const [scores, equities, found] = await Promise.all([
    readScores(read),
    readEquities(read),
    readPositions(read),
  ]);
  return { scores, equities, positions: found };
}
