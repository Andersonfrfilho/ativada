// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, desc, eq, gt, gte, lt, lte, or, type SQL } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { candles } from '../schema/candles.schema.js';
import { equityPoints } from '../schema/equity-points.schema.js';
import { positions } from '../schema/positions.schema.js';
import { signals } from '../schema/signals.schema.js';
import { POSITION_STATUS, SIGNAL_ACTION, type SignalAction } from './run-result.constant.js';
import { listLiveSummaries } from './run-live-summary.js';
import { toPositionInput, toSignalInput } from './run-result-record.mapper.js';
import type {
  DecisionMarkerRow,
  DecisionRow,
  DecisionRowPage,
  ListDecisionMarkersParams,
  ListDecisionRowsParams,
  ListPositionsAroundParams,
  RunLiveStatusRepository,
} from './run-live-status.types.js';
import type { EquityPointInput, PositionInput } from './run-result.types.js';

const DECISION_ROWS_MAXIMUM = 100;
const DECISION_MARKERS_MAXIMUM = 501;
const POSITIONS_AROUND_MAXIMUM = 600;

type ReadRequest = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
};

// A ação gravada é texto no banco: valor fora do vocabulário é dado corrompido e vira erro, nunca um pontinho inventado.
function toSignalAction(value: string): SignalAction {
  const action = Object.values(SIGNAL_ACTION).find((candidate) => candidate === value);
  if (action === undefined) throw new Error('Ação de decisão gravada desconhecida.');
  return action;
}

function clamp(value: number, maximum: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), maximum);
}

// Último ponto de patrimônio: a PK `(run_id, candle_time)` lida de trás para a frente, uma linha.
export async function readLatestEquityPoint(
  request: ReadRequest,
): Promise<EquityPointInput | undefined> {
  const { executor, scope, runId } = request;
  const [row] = await executor
    .select({
      candleTime: equityPoints.candleTime,
      equity: equityPoints.equity,
      equityAtLow: equityPoints.equityAtLow,
      benchmark: equityPoints.benchmark,
    })
    .from(equityPoints)
    .where(and(ownerCondition(scope, equityPoints.userId), eq(equityPoints.runId, runId)))
    .orderBy(desc(equityPoints.candleTime))
    .limit(1);
  return row;
}

// Vela ausente para uma decisão gravada é estado impossível (a decisão nasce de uma vela gravada): vira 500, nunca linha omitida.
function toDecisionRow(row: {
  readonly signal: typeof signals.$inferSelect;
  readonly close: string | null;
  readonly closeTime: number | null;
}): DecisionRow {
  if (row.close === null || row.closeTime === null) {
    throw new Error('Decisão gravada sem a vela correspondente.');
  }
  return { ...toSignalInput(row.signal), close: row.close, closeTime: row.closeTime };
}

// As decisões da execução, da mais recente para a mais antiga, com o fechamento da vela de cada uma numa junção pela PK de
// `candles`. Lê uma linha a mais para saber se há página seguinte.
export async function listDecisionRows(
  request: ReadRequest & { readonly params: ListDecisionRowsParams },
): Promise<DecisionRowPage> {
  const { executor, scope, runId, params } = request;
  const { market } = params;
  const limit = clamp(params.limit, DECISION_ROWS_MAXIMUM);
  const rows = await executor
    .select({ signal: signals, close: candles.close, closeTime: candles.closeTime })
    .from(signals)
    .leftJoin(
      candles,
      and(
        eq(candles.exchange, market.exchange),
        eq(candles.symbol, market.symbol),
        eq(candles.timeframe, market.timeframe),
        eq(candles.openTime, signals.candleTime),
      ),
    )
    .where(
      and(
        ownerCondition(scope, signals.userId),
        eq(signals.runId, runId),
        params.before === undefined ? undefined : lt(signals.candleTime, params.before),
      ),
    )
    .orderBy(desc(signals.candleTime))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    items: page.map(toDecisionRow),
    nextBefore: rows.length > limit ? page.at(-1)?.signal.candleTime : undefined,
  };
}

function crossesSpan(span: ListPositionsAroundParams['span']): SQL | undefined {
  if (span === undefined) return undefined;
  return and(lte(positions.openedCandleTime, span.to), gt(positions.closedCandleTime, span.from));
}

// A posição aberta e as que cruzam a faixa de velas lida: `positions_user_id_run_id_idx` e poucas linhas (no máximo uma por vela).
export async function listPositionsAround(
  request: ReadRequest & { readonly params: ListPositionsAroundParams },
): Promise<readonly PositionInput[]> {
  const { executor, scope, runId, params } = request;
  const rows = await executor
    .select()
    .from(positions)
    .where(
      and(
        ownerCondition(scope, positions.userId),
        eq(positions.runId, runId),
        or(eq(positions.status, POSITION_STATUS.OPEN), crossesSpan(params.span)),
      ),
    )
    .orderBy(desc(positions.openedCandleTime))
    .limit(clamp(params.limit, POSITIONS_AROUND_MAXIMUM));
  return rows.map(toPositionInput);
}

// A decisão de cada vela da faixa para o pontinho do gráfico: só tempo, ação e pontuação, crescente.
export async function listDecisionMarkers(
  request: ReadRequest & { readonly params: ListDecisionMarkersParams },
): Promise<readonly DecisionMarkerRow[]> {
  const { executor, scope, runId, params } = request;
  const rows = await executor
    .select({ candleTime: signals.candleTime, action: signals.action, score: signals.score })
    .from(signals)
    .where(
      and(
        ownerCondition(scope, signals.userId),
        eq(signals.runId, runId),
        gte(signals.candleTime, params.range.from),
        lt(signals.candleTime, params.range.to),
      ),
    )
    .orderBy(asc(signals.candleTime))
    .limit(clamp(params.limit, DECISION_MARKERS_MAXIMUM));
  return rows.map((row) => ({ ...row, action: toSignalAction(row.action) }));
}

export function createRunLiveStatusRepository(handle: DatabaseHandle): RunLiveStatusRepository {
  const { database } = readOpenDatabase(handle);
  return {
    readLatestEquityPoint: (scope, runId) =>
      readLatestEquityPoint({ executor: database, scope, runId }),
    listDecisionRows: (scope, runId, params) =>
      listDecisionRows({ executor: database, scope, runId, params }),
    listPositionsAround: (scope, runId, params) =>
      listPositionsAround({ executor: database, scope, runId, params }),
    listDecisionMarkers: (scope, runId, params) =>
      listDecisionMarkers({ executor: database, scope, runId, params }),
    listLiveSummaries: (scope) => listLiveSummaries(database, scope),
  };
}
