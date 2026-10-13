// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { KeyboardEvent, ReactElement } from 'react';

import { chartMoveFor, moveChartFocus } from './chart-keyboard.js';
import { describeClusterItem, describeMarker } from './chart-description.js';
import type { ChartRange } from './chart-range.js';
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
  readonly selectedKey: string | undefined;
  readonly onRangeChange: (range: ChartRange) => void;
  readonly onSelectKey: (key: string) => void;
};

type LayerProps = ChartItemsProps & { readonly tabKey: string | undefined };

function describedByFor(props: ChartItemsProps, key: string): string | undefined {
  return props.active.activeKey === key ? props.tooltipId : undefined;
}

function tabIndexFor(props: LayerProps, key: string): 0 | -1 {
  return props.tabKey === key ? 0 : -1;
}

function itemKeys(chart: TradeChart): string[] {
  return [
    ...sortMarkers(chart.markers ?? []).map(markerKey),
    ...sortClusters(chart.clusters ?? []).map(clusterKey),
  ];
}

function MarkerLayer(props: LayerProps): ReactElement {
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
          isSelected={marker.positionKey === props.selectedKey}
          tabIndex={tabIndexFor(props, markerKey(marker))}
          onSelect={() => props.onSelectKey(marker.positionKey)}
        />
      ))}
    </>
  );
}

function ClusterLayer(props: LayerProps): ReactElement {
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
          tabIndex={tabIndexFor(props, clusterKey(cluster))}
          onZoom={() => onRangeChange({ from: cluster.startTime, to: cluster.endTime })}
        />
      ))}
    </>
  );
}

// As setas ou os agrupamentos (a API manda um dos dois), em ordem de tempo: uma parada de Tab só (a última marca com foco,
// ou a primeira) e ←/→/Home/End andam entre elas.
export function ChartItems(props: ChartItemsProps): ReactElement {
  function handleKeyDown(event: KeyboardEvent<SVGGElement>): void {
    if (event.key === 'Escape') props.active.dismiss();
    const move = chartMoveFor(event.key);
    if (move === undefined) return;
    event.preventDefault();
    moveChartFocus(event.currentTarget, move);
  }
  const keys = itemKeys(props.chart);
  const rovingKey = props.active.rovingKey;
  const tabKey = rovingKey !== undefined && keys.includes(rovingKey) ? rovingKey : keys[0];
  return (
    <g role="group" aria-label="Operações no gráfico" onKeyDown={handleKeyDown}>
      <MarkerLayer {...props} tabKey={tabKey} />
      <ClusterLayer {...props} tabKey={tabKey} />
    </g>
  );
}
