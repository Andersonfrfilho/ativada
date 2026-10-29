// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../styles/Controls.module.css';
import styles from './CandleChart.module.css';
import { CHART_PERIODS, PERIOD_PLANS, type ChartPeriod } from './chart-period.js';

export type PeriodGroupProps = {
  readonly active: ChartPeriod | undefined;
  readonly onChoose: (period: ChartPeriod) => void;
};

// 1D, 1S, 1M, 1A e Tudo: cada um escolhe a vela que cabe no período e mostra o fim dele.
export function PeriodGroup({ active, onChoose }: PeriodGroupProps): ReactElement {
  return (
    <div className={styles.row} role="group" aria-label="Período do gráfico">
      {CHART_PERIODS.map((period) => {
        const plan = PERIOD_PLANS[period];
        return (
          <button
            key={period}
            type="button"
            className={`${controls.button} ${period === active ? styles.pressed : ''}`}
            aria-pressed={period === active}
            aria-label={plan.name}
            title={plan.name}
            onClick={() => onChoose(period)}
          >
            {plan.label}
          </button>
        );
      })}
    </div>
  );
}
