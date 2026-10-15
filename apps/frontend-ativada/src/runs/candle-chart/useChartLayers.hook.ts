// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Trade } from '../run.validation.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import { useTradeRows } from '../useTradeRows.hook.js';
import { CHART_LAYER } from './candle-chart.constant.js';
import { useProjectionsQuery, useStrategyLayersQuery } from './candle-chart.query.js';
import { computeLayersWindow } from './layer-series.js';
import type { ProjectionCurrent, Projections } from './projections.validation.js';
import type { StrategyLayers } from './strategy-layers.validation.js';
import type { CandleSource } from './useCandleSource.hook.js';

export type ChartLayersInput = {
  readonly runId: string;
  readonly chart: TradeChart;
  readonly view: ChartView;
  readonly source: CandleSource;
  // O instante (ms) da vela no centro do que está visível, no começo do bloco; sem ele, a vela mais nova.
  readonly centerTime: number | undefined;
};

export type ChartLayerData = {
  // A vela mostrada é a da execução: só nela a estratégia decide (RF05).
  readonly isStrategyTimeframe: boolean;
  readonly layers: StrategyLayers | undefined;
  // As camadas da estratégia falharam; as velas e as operações seguem na tela (cada consulta é independente).
  readonly hasLayersFailed: boolean;
  readonly projection: ProjectionCurrent | undefined;
  // A resposta inteira da previsão (tendência, resumo e últimas previsões) e se o pedido falhou: o painel precisa dos dois.
  readonly projections: Projections | undefined;
  readonly isProjectionError: boolean;
  readonly trades: readonly Trade[];
};

// O que as camadas pedem, cada uma na sua consulta: linhas e placar (`strategy-layers`), a tendência (`projections`, só na
// simulação ao vivo e se a camada estiver ligada) e as operações com stop e alvo (a mesma lista da tabela, sem pedido novo).
// Nunca juntar tudo num `Promise.all`: a falha de uma camada não pode derrubar as velas (code-standart §15).
export function useChartLayers(input: ChartLayersInput): ChartLayerData {
  const { runId, chart, view, source, centerTime } = input;
  const { history } = source;
  const isStrategyTimeframe = source.timeframe === chart.timeframe;
  const fallbackTime = history.candles.at(-1)?.openTime;
  const center = centerTime ?? fallbackTime;
  const window =
    isStrategyTimeframe && center !== undefined
      ? computeLayersWindow({
          centerTime: center,
          extent: chart.runRange,
          timeframeMilliseconds: source.durationMilliseconds,
        })
      : undefined;
  const layersQuery = useStrategyLayersQuery({
    runId,
    ...(window === undefined ? {} : { from: window.from, to: window.to }),
    isEnabled: window !== undefined,
  });
  const isForecastOn = source.preferences.preferences.layers[CHART_LAYER.FORECAST];
  const projections = useProjectionsQuery({
    runId,
    isEnabled: isStrategyTimeframe && view.isLive && isForecastOn,
  });
  const rows = useTradeRows(runId, view.queryRange);
  return {
    isStrategyTimeframe,
    layers: window === undefined ? undefined : layersQuery.data,
    hasLayersFailed: window !== undefined && layersQuery.isError,
    projection: projections.data?.current,
    projections: projections.data,
    isProjectionError: projections.isError,
    trades: rows.items,
  };
}
