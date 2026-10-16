// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMemo } from 'react';

import type { Trade } from '../run.validation.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { ChartView } from '../useChartView.hook.js';
import { useTradeRows } from '../useTradeRows.hook.js';
import { CHART_LAYER } from './candle-chart.constant.js';
import { useProjectionsQuery, useStrategyLayersQuery } from './candle-chart.query.js';
import { timeframeMilliseconds } from '../live-chart.js';
import { expandLayers, type DisplayMapping } from './display-mapping.js';
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

// Numa vela de exibição as camadas viram degraus onde valeram; a mesma referência enquanto nada muda.
function useExpandedLayers(
  fetched: StrategyLayers | undefined,
  mapping: DisplayMapping | undefined,
): StrategyLayers | undefined {
  return useMemo(
    () =>
      fetched === undefined || mapping === undefined ? fetched : expandLayers(fetched, mapping),
    [fetched, mapping],
  );
}

// O que as camadas pedem, cada uma na sua consulta: linhas e placar (`strategy-layers`), a tendência (`projections`, só na
// simulação ao vivo e se a camada estiver ligada) e as operações com stop e alvo (a mesma lista da tabela, sem pedido novo).
// Nunca juntar tudo num `Promise.all`: a falha de uma camada não pode derrubar as velas (code-standart §15).
export function useChartLayers(input: ChartLayersInput): ChartLayerData {
  const { runId, chart, view, source, centerTime } = input;
  const { history } = source;
  const { displayMapping } = source;
  // A estratégia decide na vela da execução; numa vela de exibição menor as camadas aparecem onde valeram (spec 017).
  const isStrategyTimeframe = source.timeframe === chart.timeframe || displayMapping !== undefined;
  const fallbackTime = history.candles.at(-1)?.openTime;
  const center = centerTime ?? fallbackTime;
  const window =
    isStrategyTimeframe && center !== undefined
      ? computeLayersWindow({
          centerTime: center,
          extent: chart.runRange,
          timeframeMilliseconds: timeframeMilliseconds(chart.timeframe) ?? 0,
        })
      : undefined;
  const layersQuery = useStrategyLayersQuery({
    runId,
    ...(window === undefined ? {} : { from: window.from, to: window.to }),
    isEnabled: window !== undefined,
  });
  const isForecastOn = source.preferences.preferences.layers[CHART_LAYER.FORECAST];
  const isForecastEnabled = isStrategyTimeframe && view.isLive && isForecastOn;
  const projections = useProjectionsQuery({ runId, isEnabled: isForecastEnabled });
  // A consulta é a mesma do cartão de histórico (backtest também a pede): sem a camada ligada, o cache não vira previsão.
  const forecast = isForecastEnabled ? projections.data : undefined;
  const rows = useTradeRows(runId, view.queryRange);
  const layers = useExpandedLayers(
    window === undefined ? undefined : layersQuery.data,
    displayMapping,
  );
  return {
    isStrategyTimeframe,
    layers,
    hasLayersFailed: window !== undefined && layersQuery.isError,
    projection: forecast?.current,
    projections: forecast,
    isProjectionError: isForecastEnabled && projections.isError,
    trades: rows.items,
  };
}
