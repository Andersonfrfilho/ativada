// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { formatDecimal } from '../format/format.js';
import { formatDayAndTime } from '../runs/live-tracking/goal-text.js';
import { describeBalanceSteps, findBalanceExtremes } from './balance-axis.js';
import { EquitySparkline } from './EquitySparkline.component.js';
import styles from './Overview.module.css';
import type { EquityPoint, Signal } from './overview.validation.js';

export type BalanceChartProps = {
  readonly points: readonly EquityPoint[];
  readonly timeframe: string;
  readonly signals?: readonly Signal[];
};

// O gráfico "Saldo hora a hora" (redesenho aprovado): maior e menor valor no eixo, começo e "agora" embaixo e a legenda das duas linhas.
export function BalanceChart({ points, timeframe, signals }: BalanceChartProps): ReactElement {
  const timeZone = useUserTimeZone();
  const extremes = findBalanceExtremes(points);
  const first = points[0];
  return (
    <div className={styles.chartBlock}>
      <h3 className={styles.chartTitle}>Saldo {describeBalanceSteps(timeframe)} (USDT)</h3>
      <div className={styles.chartGrid}>
        <div className={styles.yAxis} aria-hidden="true">
          <span>{extremes === undefined ? '' : formatDecimal(extremes.maxText)}</span>
          <span>{extremes === undefined ? '' : formatDecimal(extremes.minText)}</span>
        </div>
        <EquitySparkline points={points} {...(signals === undefined ? {} : { signals })} />
        <div className={styles.xAxis} aria-hidden="true">
          <span>{first === undefined ? '' : formatDayAndTime(first.candleTime, timeZone)}</span>
          <span>agora</span>
        </div>
      </div>
      <ul className={styles.legend} aria-label="Legenda do gráfico">
        <li>
          <span className={styles.legendOwn} aria-hidden="true" />
          Sua simulação
        </li>
        <li>
          <span className={styles.legendBench} aria-hidden="true" />
          Comprar e segurar
        </li>
      </ul>
    </div>
  );
}
