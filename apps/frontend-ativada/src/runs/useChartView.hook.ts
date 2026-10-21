// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UseQueryResult } from '@tanstack/react-query';

import { clampRange, type ChartRange } from './chart-range.js';
import { CHART_WIDTH, chartColumnsFor } from './price-chart.js';
import { RUN_KIND } from './run.constant.js';
import { useRunDetailQuery } from './runs.query.js';
import { useTradeChartQuery } from './trade-chart.query.js';
import type { TradeChart } from './trade-chart.validation.js';

// A sonda só serve para descobrir a faixa efetiva da execução: o mínimo de colunas que a API aceita.
const PROBE_COLUMNS = 100;

export type ChartView = {
  readonly chart: UseQueryResult<TradeChart>;
  // A faixa em que a execução tem preço e operações, como a API a calcula (limite do deslocamento e da centralização).
  readonly extent: ChartRange | undefined;
  // A faixa da URL já recortada à da execução; sem faixa (ou fora da execução) o gráfico mostra tudo.
  readonly range: ChartRange | undefined;
  readonly queryRange: { readonly from?: number; readonly to?: number };
  // O que o gráfico mostra agora, para preencher os campos de data.
  readonly shown: ChartRange | undefined;
  readonly isLive: boolean;
};

function toExtent(runRange: ChartRange | undefined): ChartRange | undefined {
  return runRange !== undefined && runRange.to > runRange.from ? runRange : undefined;
}

// O gráfico da faixa da URL e o que se deriva dele e da execução. A faixa da URL só vai à API depois de recortada
// à faixa efetiva da execução (walk-forward: só a parte fora da amostra), senão a API responde 400.
export function useChartView(runId: string, urlRange: ChartRange | undefined): ChartView {
  const run = useRunDetailQuery(runId);
  const probe = useTradeChartQuery({
    runId,
    columns: PROBE_COLUMNS,
    isEnabled: urlRange !== undefined,
  });
  const probeExtent = toExtent(probe.data?.runRange);
  const range =
    urlRange === undefined || probeExtent === undefined
      ? undefined
      : clampRange(urlRange, probeExtent);
  const isWaitingForExtent = urlRange !== undefined && probe.data === undefined && !probe.isError;
  const queryRange = range === undefined ? {} : { from: range.from, to: range.to };
  const chart = useTradeChartQuery({
    runId,
    columns: chartColumnsFor(CHART_WIDTH),
    isEnabled: !isWaitingForExtent,
    ...queryRange,
  });
  return {
    chart,
    extent: toExtent(chart.data?.runRange) ?? probeExtent,
    range,
    queryRange,
    shown: chart.data === undefined ? undefined : { from: chart.data.from, to: chart.data.to },
    isLive: run.data?.kind === RUN_KIND.LIVE_PAPER,
  };
}
