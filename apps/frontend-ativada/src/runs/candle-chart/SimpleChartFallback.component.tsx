// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../styles/Controls.module.css';
import { PriceChart } from '../PriceChart.component.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { TradeSelection } from '../useTradeSelection.hook.js';

export type SimpleChartFallbackProps = {
  readonly chart: TradeChart;
  readonly timeZone: string;
  readonly selection: TradeSelection;
  readonly reason: string;
};

// O gráfico simples da spec 005 é a reserva: par fora da lista atual (sem velas públicas) ou o desenho que não carregou.
// Operações, faixa na URL e seleção continuam funcionando.
export function SimpleChartFallback(props: SimpleChartFallbackProps): ReactElement {
  const { chart, timeZone, selection, reason } = props;
  return (
    <>
      <p className={controls.muted}>{reason}</p>
      <PriceChart
        chart={chart}
        timeZone={timeZone}
        selectedKey={selection.selectedKey}
        onRangeChange={selection.setRange}
        onSelectKey={(key) => selection.select({ key, range: undefined })}
      />
    </>
  );
}
