// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { KeyboardEvent, ReactElement } from 'react';

import { CHART_ITEM_ATTRIBUTE } from './chart-keyboard.js';
import type { ClusterPlacement } from './price-chart-markers.js';
import styles from './PriceChart.module.css';
import type { ItemHandlers } from './useActiveChartItem.hook.js';

export type MarkerClusterProps = {
  readonly placement: ClusterPlacement;
  readonly label: string;
  readonly handlers: ItemHandlers;
  readonly describedBy: string | undefined;
  readonly onZoom: () => void;
};

// Agrupamento: círculo com a contagem (forma diferente das setas). Enter, espaço ou clique aproximam.
export function MarkerCluster({
  placement,
  label,
  handlers,
  describedBy,
  onZoom,
}: MarkerClusterProps): ReactElement {
  const dataAttribute = { [CHART_ITEM_ATTRIBUTE]: 'cluster' };
  function handleKeyDown(event: KeyboardEvent<SVGGElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onZoom();
  }
  return (
    <g
      {...handlers}
      {...dataAttribute}
      className={styles.item}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={onZoom}
      onKeyDown={handleKeyDown}
    >
      <circle className={styles.cluster} cx={placement.x} cy={placement.y} r={placement.radius} />
      <text className={styles.clusterCount} x={placement.x} y={placement.y}>
        {placement.count}
      </text>
    </g>
  );
}
