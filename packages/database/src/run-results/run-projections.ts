// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, asc, eq, gte, lt } from 'drizzle-orm';

import type { DatabaseExecutor } from '../database-executor.js';
import { readOpenDatabase, type DatabaseHandle } from '../database-handle.js';
import { readJsonContainer } from '../jsonb.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { signals } from '../schema/signals.schema.js';
import { listProjectionItems } from './run-projection-items.js';
import { summarizeProjections } from './run-projection-summary.js';
import type {
  LayerRow,
  ListLayerRowsParams,
  RunProjectionRepository,
} from './run-projections.types.js';
import { SIGNAL_ACTION, type SignalAction } from './run-result.constant.js';

// O teto de velas de uma página de camadas (ADR 0002, spec 009, P1): a rota recusa mais que isso antes de consultar.
const LAYER_ROWS_MAXIMUM = 1_000;

type LayerRowsRequest = {
  readonly executor: DatabaseExecutor;
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly params: ListLayerRowsParams;
};

// A ação gravada é texto no banco: valor fora do vocabulário é dado corrompido e vira erro, nunca uma barra inventada.
function toSignalAction(value: string): SignalAction {
  const action = Object.values(SIGNAL_ACTION).find((candidate) => candidate === value);
  if (action === undefined) throw new Error('Ação de decisão gravada desconhecida.');
  return action;
}

// As velas decididas da faixa `[from, to)` para as camadas do gráfico: só tempo, ação, placar e leituras, crescente, por
// `signals_run_id_candle_time_unique` (a execução do dono e uma faixa de `candle_time`).
export async function listLayerRows(request: LayerRowsRequest): Promise<readonly LayerRow[]> {
  const { executor, scope, runId, params } = request;
  const limit = Math.min(Math.max(Math.trunc(params.limit), 1), LAYER_ROWS_MAXIMUM);
  const rows = await executor
    .select({
      candleTime: signals.candleTime,
      action: signals.action,
      score: signals.score,
      indicators: signals.indicators,
    })
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
    .limit(limit);
  return rows.map((row) => ({
    candleTime: row.candleTime,
    action: toSignalAction(row.action),
    score: row.score,
    indicators: readJsonContainer(row.indicators),
  }));
}

export function createRunProjectionRepository(handle: DatabaseHandle): RunProjectionRepository {
  const { database } = readOpenDatabase(handle);
  return {
    listLayerRows: (scope, runId, params) =>
      listLayerRows({ executor: database, scope, runId, params }),
    summarizeProjections: (scope, runId, params) =>
      summarizeProjections({ executor: database, scope, runId, params }),
    listProjectionItems: (scope, runId, params) =>
      listProjectionItems({ executor: database, scope, runId, params }),
  };
}
