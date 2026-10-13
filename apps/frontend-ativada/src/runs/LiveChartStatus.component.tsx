// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatTimeInZone } from '../format/zoned-time.js';
import controls from '../styles/Controls.module.css';
import { hasNewerCandles, lastClosedAt } from './live-chart.js';
import styles from './LiveChartStatus.module.css';
import type { ChartView } from './useChartView.hook.js';
import type { TradeSelection } from './useTradeSelection.hook.js';

export type LiveChartStatusProps = {
  readonly view: ChartView;
  readonly selection: TradeSelection;
  readonly timeZone: string;
};

function lastClosedLabel(view: ChartView, timeZone: string): string {
  const chart = view.chart.data;
  const closedAt = chart === undefined ? undefined : lastClosedAt(chart);
  return closedAt === undefined
    ? ''
    : ` · última vela fechada às ${formatTimeInZone(closedAt, timeZone)}`;
}

// Só na simulação ao vivo. Sem faixa na URL o gráfico "acompanha" (termina na última vela fechada e anda junto);
// com faixa ele fica parado e o aviso leva de volta ao fim.
export function LiveChartStatus({
  view,
  selection,
  timeZone,
}: LiveChartStatusProps): ReactElement | null {
  if (!view.isLive) return null;
  const isFollowing = selection.range === undefined;
  const hasNews = hasNewerCandles(selection.range, view.chart.data?.lastClosedCandleTime);
  return (
    <div className={styles.status}>
      <p className={controls.muted}>
        {isFollowing ? 'Acompanhando o fim da simulação' : 'Faixa fixa: o gráfico não anda sozinho'}
        {lastClosedLabel(view, timeZone)}
      </p>
      <div role="status">
        {hasNews ? (
          <button
            type="button"
            className={`${controls.button} ${styles.notice}`}
            onClick={() => selection.setRange(undefined)}
          >
            Há velas novas — ir para o fim
          </button>
        ) : null}
      </div>
    </div>
  );
}
