// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import type { ChartRange } from './chart-range.js';
import { PriceChart } from './PriceChart.component.js';
import type { TradeChart } from './trade-chart.validation.js';

export type TradeChartBodyProps = {
  readonly chart: UseQueryResult<TradeChart>;
  readonly timeZone: string;
  readonly selectedKey: string | undefined;
  readonly onRangeChange: (range: ChartRange | undefined) => void;
  readonly onSelectKey: (key: string) => void;
};

// O gráfico, ou o motivo de ele ainda não estar na tela.
export function TradeChartBody(props: TradeChartBodyProps): ReactElement {
  const { chart, timeZone, selectedKey, onRangeChange, onSelectKey } = props;
  if (chart.data === undefined) {
    return (
      <p className={controls.muted}>
        {chart.isError ? 'Não foi possível carregar o gráfico.' : 'Carregando o gráfico…'}
      </p>
    );
  }
  return (
    <PriceChart
      chart={chart.data}
      timeZone={timeZone}
      selectedKey={selectedKey}
      onRangeChange={onRangeChange}
      onSelectKey={onSelectKey}
    />
  );
}
