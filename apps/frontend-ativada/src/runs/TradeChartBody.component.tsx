// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import { CandleChart } from './candle-chart/CandleChart.component.js';
import { EmptyChartNotice } from './EmptyChartNotice.component.js';
import type { ChartView } from './useChartView.hook.js';
import type { TradeSelection } from './useTradeSelection.hook.js';

export type TradeChartBodyProps = {
  readonly runId: string;
  readonly view: ChartView;
  readonly selection: TradeSelection;
};

// O gráfico de velas, ou o motivo de ele ainda não estar na tela.
export function TradeChartBody({ runId, view, selection }: TradeChartBodyProps): ReactElement {
  const { chart } = view;
  if (chart.data === undefined) {
    return (
      <p className={controls.muted}>
        {chart.isError ? 'Não foi possível carregar o gráfico.' : 'Carregando o gráfico…'}
      </p>
    );
  }
  const { runRange } = chart.data;
  if (runRange.to <= runRange.from) return <EmptyChartNotice runId={runId} />;
  return <CandleChart runId={runId} chart={chart.data} view={view} selection={selection} />;
}
