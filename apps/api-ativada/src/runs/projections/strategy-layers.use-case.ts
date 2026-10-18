// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { LayerRow, OwnerScope, RunProjectionRepository, TimeRange } from '@ativada/database';
import {
  formatEngineDecimal,
  RISK_ATR_INDICATOR_ID,
  toEngineDecimal,
} from '@ativada/strategy-engine';

import { readSignalSource } from '@ativada/model-agents';

import { RequestValidationError } from '../../shared/http/request-validation.error.js';
import { clipRange } from '../chart/run-chart-range.js';
import {
  buildLineDefinitions,
  readIndicatorText,
  type LayerLineDefinition,
} from './strategy-layer-lines.js';
import {
  LAYER_QUERY_FIELD,
  LAYER_QUERY_REASON,
  STRATEGY_LAYERS_MAXIMUM_CANDLES,
  STRATEGY_LAYERS_VERSION,
} from './projections.constant.js';
import {
  readProjectionContext,
  type ProjectionContext,
  type ProjectionRunDependencies,
} from './projection-context.js';
import type { StrategyLayersQuery, StrategyLayersView } from './strategy-layers.schema.js';

export type StrategyLayersDependencies = ProjectionRunDependencies & {
  readonly projections: Pick<RunProjectionRepository, 'listLayerRows'>;
};

export type StrategyLayersUseCase = (
  scope: OwnerScope,
  runId: string,
  query: StrategyLayersQuery,
) => Promise<StrategyLayersView>;

const canonical = (text: string): string => formatEngineDecimal(toEngineDecimal(text));

// A faixa pedida recortada à da execução; sem `to` vai ao fim dela e sem `from` volta 1.000 velas (o teto da resposta).
// Mais de 1.000 velas é 400 sem consultar o banco.
function resolveLayerRange(params: {
  readonly runRange: TimeRange;
  readonly query: StrategyLayersQuery;
  readonly durationMilliseconds: number;
}): TimeRange {
  const { runRange, query } = params;
  const maximum = STRATEGY_LAYERS_MAXIMUM_CANDLES * params.durationMilliseconds;
  const to = Math.min(query.to ?? runRange.to, runRange.to);
  const from = query.from ?? Math.max(runRange.from, to - maximum);
  const range = clipRange(runRange, { from, to });
  if (range.to - range.from > maximum) {
    throw new RequestValidationError([
      { field: LAYER_QUERY_FIELD.TO, reason: LAYER_QUERY_REASON.RANGE_TOO_LARGE },
    ]);
  }
  return range;
}

function toThresholds(
  context: ProjectionContext,
  range: TimeRange,
): StrategyLayersView['thresholds'] {
  return context.segments
    .filter((segment) => segment.from < range.to && segment.to > range.from)
    .map((segment) => ({
      from: Math.max(segment.from, range.from),
      to: Math.min(segment.to, range.to),
      buy: segment.buy,
      sell: segment.sell,
    }));
}

function toLine(
  definition: LayerLineDefinition,
  rows: readonly LayerRow[],
): StrategyLayersView['lines'][number] {
  return {
    ...definition,
    values: rows.map((row) => readIndicatorText(row.indicators, definition.key)),
  };
}

function toView(params: {
  readonly context: ProjectionContext;
  readonly range: TimeRange;
  readonly rows: readonly LayerRow[];
}): StrategyLayersView {
  const { context, range, rows } = params;
  const definitions = buildLineDefinitions({
    rules: context.config.rules,
    windowConfigs: context.windowConfigs,
  });
  return {
    version: STRATEGY_LAYERS_VERSION,
    timeframe: context.run.timeframe,
    from: range.from,
    to: range.to,
    candleTimes: rows.map((row) => row.candleTime),
    score: rows.map((row) => canonical(row.score)),
    actions: rows.map((row) => row.action),
    atr: rows.map((row) => readIndicatorText(row.indicators, RISK_ATR_INDICATOR_ID)),
    lines: definitions.map((definition) => toLine(definition, rows)),
    thresholds: toThresholds(context, range),
  };
}

// Execução na fila (ou ao vivo antes da primeira vela): listas vazias, não erro.
function emptyView(context: ProjectionContext, unavailable?: 'team_run'): StrategyLayersView {
  const empty = { from: context.run.periodStart, to: context.run.periodStart };
  return {
    ...toView({ context: { ...context, segments: [] }, range: empty, rows: [] }),
    lines: [],
    ...(unavailable === undefined ? {} : { unavailable }),
  };
}

// As camadas do gráfico (ADR 0002, spec 009, P1 e P2): nada é recalculado, as linhas, o placar e o ATR são o que o motor gravou
// em `signals` por vela decidida. No máximo 4 consultas: execução, versão, janelas (só walk-forward) e as linhas da faixa.
export function createStrategyLayersUseCase(
  dependencies: StrategyLayersDependencies,
): StrategyLayersUseCase {
  return async (scope, runId, query) => {
    const context = await readProjectionContext(dependencies, { scope, runId });
    if (readSignalSource(context.run.request) !== undefined) return emptyView(context, 'team_run');
    if (context.runRange === undefined) return emptyView(context);
    const range = resolveLayerRange({
      runRange: context.runRange,
      query,
      durationMilliseconds: context.durationMilliseconds,
    });
    const rows = await dependencies.projections.listLayerRows(scope, context.run.id, {
      range,
      limit: STRATEGY_LAYERS_MAXIMUM_CANDLES,
    });
    return toView({ context, range, rows });
  };
}
