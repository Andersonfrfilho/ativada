// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatInZone } from '../../format/zoned-time.js';
import controls from '../../styles/Controls.module.css';
import type { ChartRange } from '../chart-range.js';
import { describeCluster, sortClusters } from '../price-chart-markers.js';
import type { ChartCluster } from '../trade-chart.validation.js';
import styles from './CandleChart.module.css';

export type ClusterButtonsProps = {
  readonly clusters: readonly ChartCluster[];
  readonly timeZone: string;
  readonly onZoom: (range: ChartRange) => void;
};

// Acima de 500 operações na faixa o servidor manda agrupamentos no lugar das setas (spec 005, RF05): cada um é um botão
// que aproxima o período até ver cada operação, pela URL.
export function ClusterButtons({ clusters, timeZone, onZoom }: ClusterButtonsProps): ReactElement {
  return (
    <div className={styles.clusters} role="group" aria-label="Operações agrupadas">
      <p className={controls.muted}>
        Há muitas operações neste período. Aproxime para ver cada uma.
      </p>
      {sortClusters(clusters).map((cluster) => (
        <button
          key={`${cluster.startTime}-${cluster.endTime}`}
          type="button"
          className={controls.button}
          onClick={() => onZoom({ from: cluster.startTime, to: cluster.endTime })}
        >
          {describeCluster(cluster)} · {formatInZone(cluster.startTime, timeZone)}
        </button>
      ))}
    </div>
  );
}
