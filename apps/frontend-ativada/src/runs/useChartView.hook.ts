// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UseQueryResult } from '@tanstack/react-query';

import { runExtent, type ChartRange } from './chart-range.js';
import { CHART_WIDTH, chartColumnsFor } from './price-chart.js';
import { RUN_KIND } from './run.constant.js';
import { useRunDetailQuery } from './runs.query.js';
import { useTradeChartQuery } from './trade-chart.query.js';
import type { TradeChart } from './trade-chart.validation.js';
import type { TradeSelection } from './useTradeSelection.hook.js';

export type ChartView = {
  readonly chart: UseQueryResult<TradeChart>;
  // O período inteiro da execução (limite do deslocamento e da centralização).
  readonly extent: ChartRange | undefined;
  // O que o gráfico mostra agora, para preencher os campos de data.
  readonly shown: ChartRange | undefined;
  readonly isLive: boolean;
};

// O gráfico da faixa da URL e o que se deriva dele e da execução.
export function useChartView(runId: string, queryRange: TradeSelection['queryRange']): ChartView {
  const run = useRunDetailQuery(runId);
  const chart = useTradeChartQuery({ runId, columns: chartColumnsFor(CHART_WIDTH), ...queryRange });
  const extent =
    run.data === undefined
      ? undefined
      : runExtent({
          periodStart: run.data.periodStart,
          periodEnd: run.data.periodEnd,
          lastClosedCandleTime: chart.data?.lastClosedCandleTime,
        });
  return {
    chart,
    extent,
    shown: chart.data === undefined ? undefined : { from: chart.data.from, to: chart.data.to },
    isLive: run.data?.kind === RUN_KIND.LIVE_PAPER,
  };
}
