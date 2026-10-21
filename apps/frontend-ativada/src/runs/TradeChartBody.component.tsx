// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { isRateLimitError } from '../http/rate-limit.js';
import controls from '../styles/Controls.module.css';
import { BesideTeam } from './team-room/BesideTeam.component.js';
import { CandleChart } from './candle-chart/CandleChart.component.js';
import { RateLimitNotice } from './RateLimitNotice.component.js';
import { EmptyChartNotice } from './EmptyChartNotice.component.js';
import type { ChartView } from './useChartView.hook.js';
import type { TradeSelection } from './useTradeSelection.hook.js';

export type TradeChartBodyProps = {
  readonly runId: string;
  readonly view: ChartView;
  readonly selection: TradeSelection;
};

// O gráfico de velas; sem vela processada ele abre com as do par como contexto, sob o aviso da espera.
export function TradeChartBody({ runId, view, selection }: TradeChartBodyProps): ReactElement {
  const { chart } = view;
  if (chart.data === undefined) {
    const isRateLimited = isRateLimitError(chart.error ?? chart.failureReason);
    return (
      <BesideTeam>
        {isRateLimited ? (
          <RateLimitNotice retryAt={undefined} onRetry={() => void chart.refetch()} />
        ) : (
          <p className={controls.muted}>
            {chart.isError ? 'Não foi possível carregar o gráfico.' : 'Carregando o gráfico…'}
          </p>
        )}
      </BesideTeam>
    );
  }
  const { runRange } = chart.data;
  const candleChart = (
    <CandleChart runId={runId} chart={chart.data} view={view} selection={selection} />
  );
  if (runRange.to > runRange.from) return candleChart;
  return (
    <>
      <EmptyChartNotice runId={runId} />
      {candleChart}
    </>
  );
}
