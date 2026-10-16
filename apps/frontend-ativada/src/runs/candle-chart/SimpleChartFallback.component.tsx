// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import controls from '../../styles/Controls.module.css';
import styles from './CandleChart.module.css';
import { PriceChart } from '../PriceChart.component.js';
import type { TradeChart } from '../trade-chart.validation.js';
import type { TradeSelection } from '../useTradeSelection.hook.js';

export type SimpleChartFallbackProps = {
  readonly chart: TradeChart;
  readonly timeZone: string;
  readonly selection: TradeSelection;
  // Um texto simples ou um aviso pronto (o do limite de pedidos).
  readonly reason: ReactNode;
  // Pede as velas de novo; `undefined` quando pedir outra vez não adianta.
  readonly onRetry: (() => void) | undefined;
  // Sai de uma vela escolhida que o ambiente não tem: volta para a da execução.
  readonly onBackToRun: (() => void) | undefined;
};

// O gráfico simples da spec 005 é a reserva: par fora da lista atual (sem velas públicas) ou o desenho que não carregou.
// Operações, faixa na URL e seleção continuam funcionando.
export function SimpleChartFallback(props: SimpleChartFallbackProps): ReactElement {
  const { chart, timeZone, selection, reason, onRetry, onBackToRun } = props;
  return (
    <>
      {typeof reason === 'string' ? <p className={controls.muted}>{reason}</p> : reason}
      <div className={styles.row}>
        {onRetry === undefined ? null : (
          <button type="button" className={controls.button} onClick={onRetry}>
            Tentar de novo
          </button>
        )}
        {onBackToRun === undefined ? null : (
          <button type="button" className={controls.button} onClick={onBackToRun}>
            Voltar para a vela da execução ({chart.timeframe})
          </button>
        )}
      </div>
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
