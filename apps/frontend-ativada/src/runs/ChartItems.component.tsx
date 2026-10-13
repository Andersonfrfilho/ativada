// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { KeyboardEvent, ReactElement } from 'react';

import { arrowStep, moveChartFocus } from './chart-keyboard.js';
import type { ChartRange } from './chart-range.js';
import { describeClusterItem, describeMarker } from './marker-facts.js';
import { MarkerCluster } from './MarkerCluster.component.js';
import {
  clusterKey,
  markerKey,
  placeCluster,
  placeMarker,
  sortClusters,
  sortMarkers,
} from './price-chart-markers.js';
import type { ChartScale } from './price-chart.js';
import { TradeMarker } from './TradeMarker.component.js';
import type { TradeChart } from './trade-chart.validation.js';
import type { ActiveChartItem } from './useActiveChartItem.hook.js';

export type ChartItemsProps = {
  readonly chart: TradeChart;
  readonly scale: ChartScale;
  readonly timeZone: string;
  readonly active: ActiveChartItem;
  readonly tooltipId: string;
  readonly onRangeChange: (range: ChartRange) => void;
};

function describedByFor(props: ChartItemsProps, key: string): string | undefined {
  return props.active.activeKey === key ? props.tooltipId : undefined;
}

function MarkerLayer(props: ChartItemsProps): ReactElement {
  const { chart, scale, timeZone, active } = props;
  return (
    <>
      {sortMarkers(chart.markers ?? []).map((marker) => (
        <TradeMarker
          key={markerKey(marker)}
          placement={placeMarker(scale, marker)}
          label={describeMarker({ marker, symbol: chart.symbol, timeZone })}
          handlers={active.bind(markerKey(marker))}
          describedBy={describedByFor(props, markerKey(marker))}
        />
      ))}
    </>
  );
}

function ClusterLayer(props: ChartItemsProps): ReactElement {
  const { chart, scale, active, onRangeChange } = props;
  return (
    <>
      {sortClusters(chart.clusters ?? []).map((cluster) => (
        <MarkerCluster
          key={clusterKey(cluster)}
          placement={placeCluster(scale, chart.columns, cluster)}
          label={describeClusterItem(cluster)}
          handlers={active.bind(clusterKey(cluster))}
          describedBy={describedByFor(props, clusterKey(cluster))}
          onZoom={() => onRangeChange({ from: cluster.startTime, to: cluster.endTime })}
        />
      ))}
    </>
  );
}

// As setas ou os agrupamentos (a API manda um dos dois), em ordem de tempo: Tab e ←/→ andam por elas.
export function ChartItems(props: ChartItemsProps): ReactElement {
  function handleKeyDown(event: KeyboardEvent<SVGGElement>): void {
    if (event.key === 'Escape') props.active.dismiss();
    const step = arrowStep(event.key);
    if (step === undefined) return;
    event.preventDefault();
    moveChartFocus(event.currentTarget, step);
  }
  return (
    <g role="group" aria-label="Operações no gráfico" onKeyDown={handleKeyDown}>
      <MarkerLayer {...props} />
      <ClusterLayer {...props} />
    </g>
  );
}
