// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  type DecisionMarkerRow,
  type OwnerScope,
  type PositionInput,
  type RunLiveStatusRepository,
  type RunRecord,
  type StrategyRepository,
  type TimeRange,
} from '@ativada/database';
import {
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  formatEngineDecimal,
  parseStrategyConfig,
  toEngineDecimal,
  type SignalAction,
  type StrategyConfig,
} from '@ativada/strategy-engine';

import { isHoldingAt } from '../live-status/decision-view.js';
import { resolveDecisionOutcome } from '../live-status/decision-messages.js';
import type { DecisionOutcome } from '../live-status/live-status.constant.js';
import { CHART_MARKER_LIMIT } from '../runs.constant.js';

// A decisão de uma vela para o pontinho do gráfico (ADR 0002, spec 008, L16): só o que a dica precisa.
export type ChartDecisionView = {
  readonly candleTime: number;
  readonly closedAt: number;
  readonly action: SignalAction;
  readonly outcome: DecisionOutcome;
  readonly score: string;
  readonly scoreThreshold: string;
};

export type ChartDecisionDependencies = {
  readonly strategies: Pick<StrategyRepository, 'findVersion'>;
  readonly live: Pick<RunLiveStatusRepository, 'listDecisionMarkers' | 'listPositionsAround'>;
};

const canonical = (text: string): string => formatEngineDecimal(toEngineDecimal(text));

function toDecisionViews(params: {
  readonly markers: readonly DecisionMarkerRow[];
  readonly positions: readonly PositionInput[];
  readonly config: StrategyConfig;
  readonly durationMilliseconds: number;
}): readonly ChartDecisionView[] {
  const { config } = params;
  return params.markers.map((marker) => {
    const isHolding = isHoldingAt(params.positions, marker.candleTime);
    return {
      candleTime: marker.candleTime,
      closedAt: marker.candleTime + params.durationMilliseconds,
      action: marker.action,
      outcome: resolveDecisionOutcome({ action: marker.action, isHolding }),
      score: canonical(marker.score),
      scoreThreshold: canonical(isHolding ? config.thresholds.sell : config.thresholds.buy),
    };
  });
}

// As decisões da faixa visível, só na simulação ao vivo e só com até 500 velas na faixa (a conta não consulta o banco):
// acima disso viram borrão e pesam, então a resposta é `null` e o painel pede para aproximar (spec 008, D5).
export async function readChartDecisions(
  dependencies: ChartDecisionDependencies,
  params: { readonly scope: OwnerScope; readonly run: RunRecord; readonly range: TimeRange },
): Promise<readonly ChartDecisionView[] | null> {
  const { scope, run, range } = params;
  if (run.kind !== RUN_KIND.LIVE_PAPER) return null;
  const timeframe = Object.values(ENGINE_TIMEFRAME).find(
    (candidate) => candidate === run.timeframe,
  );
  if (timeframe === undefined) return null;
  const durationMilliseconds = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[timeframe];
  if ((range.to - range.from) / durationMilliseconds > CHART_MARKER_LIMIT) return null;
  const markers = await dependencies.live.listDecisionMarkers(scope, run.id, {
    range,
    limit: CHART_MARKER_LIMIT + 1,
  });
  const first = markers[0];
  const last = markers.at(-1);
  if (first === undefined || last === undefined) return [];
  if (markers.length > CHART_MARKER_LIMIT) return null;
  const [version, positions] = await Promise.all([
    dependencies.strategies.findVersion(scope, run.strategyVersionId),
    dependencies.live.listPositionsAround(scope, run.id, {
      span: { from: first.candleTime, to: last.candleTime },
      limit: markers.length + 2,
    }),
  ]);
  if (version === undefined) throw new Error('Versão da estratégia da execução ausente.');
  return toDecisionViews({
    markers,
    positions,
    config: parseStrategyConfig(version.config),
    durationMilliseconds,
  });
}
