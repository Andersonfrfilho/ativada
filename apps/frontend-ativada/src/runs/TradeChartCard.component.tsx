// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { runExtent } from './chart-range.js';
import { ChartRangeControls } from './ChartRangeControls.component.js';
import { CHART_WIDTH, chartColumnsFor } from './price-chart.js';
import { PriceChart } from './PriceChart.component.js';
import { useRunDetailQuery } from './runs.query.js';
import { useTradeChartQuery } from './trade-chart.query.js';
import { useTradeSelection } from './useTradeSelection.hook.js';

export type TradeChartCardProps = { readonly runId: string };

// O gráfico de preço da execução com as compras e vendas; a faixa visível vem da URL (`?de=&ate=`).
export function TradeChartCard({ runId }: TradeChartCardProps): ReactElement {
  const timeZone = useUserTimeZone();
  const selection = useTradeSelection();
  const run = useRunDetailQuery(runId);
  const chart = useTradeChartQuery({
    runId,
    columns: chartColumnsFor(CHART_WIDTH),
    ...selection.queryRange,
  });
  const extent =
    run.data === undefined
      ? undefined
      : runExtent({
          periodStart: run.data.periodStart,
          periodEnd: run.data.periodEnd,
          lastClosedCandleTime: chart.data?.lastClosedCandleTime,
        });
  const shown = chart.data === undefined ? undefined : { from: chart.data.from, to: chart.data.to };
  return (
    <Card title="Preço e operações">
      <ChartRangeControls
        extent={extent}
        range={selection.range}
        shown={shown}
        onRangeChange={selection.setRange}
      />
      {chart.data === undefined ? (
        <p className={controls.muted}>
          {chart.isError ? 'Não foi possível carregar o gráfico.' : 'Carregando o gráfico…'}
        </p>
      ) : (
        <PriceChart chart={chart.data} timeZone={timeZone} onRangeChange={selection.setRange} />
      )}
    </Card>
  );
}
