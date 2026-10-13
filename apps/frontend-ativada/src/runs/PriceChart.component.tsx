// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { formatSymbol } from '../format/format.js';
import { describeChart } from './chart-description.js';
import type { ChartRange } from './chart-range.js';
import { ChartItems } from './ChartItems.component.js';
import { resolveTooltip } from './marker-facts.js';
import { MarkerTooltip } from './MarkerTooltip.component.js';
import {
  buildBandPoints,
  buildLinePoints,
  CHART_HEIGHT,
  CHART_WIDTH,
  createChartScale,
  findPriceBounds,
  toPathData,
  type ChartScale,
} from './price-chart.js';
import styles from './PriceChart.module.css';
import { PriceChartAxes } from './PriceChartAxes.component.js';
import { PriceChartLegend } from './PriceChartLegend.component.js';
import type { TradeChart } from './trade-chart.validation.js';
import { useActiveChartItem } from './useActiveChartItem.hook.js';

export type PriceChartProps = {
  readonly chart: TradeChart;
  readonly timeZone: string;
  readonly onRangeChange: (range: ChartRange) => void;
};

type PriceLayersProps = {
  readonly chart: TradeChart;
  readonly scale: ChartScale;
  readonly descriptionId: string;
};

// O desenho do preço é UMA imagem para o leitor de tela (a descrição está no texto abaixo); as setas ficam fora dela, porque
// filho de role="img" é apresentacional e a seta precisa de foco.
function PriceLayers({ chart, scale, descriptionId }: PriceLayersProps): ReactElement {
  return (
    <g
      role="img"
      aria-label={`Gráfico do preço de ${formatSymbol(chart.symbol)}`}
      aria-describedby={descriptionId}
    >
      <path className={styles.band} d={toPathData(buildBandPoints(scale, chart.columns), true)} />
      <path className={styles.line} d={toPathData(buildLinePoints(scale, chart.columns), false)} />
    </g>
  );
}

// SVG à mão, sem biblioteca: faixa da mínima à máxima, linha do fechamento e, por cima, as setas ou os agrupamentos.
export function PriceChart({ chart, timeZone, onRangeChange }: PriceChartProps): ReactElement {
  const tooltipId = useId();
  const descriptionId = useId();
  const active = useActiveChartItem();
  const bounds = findPriceBounds(chart.columns);
  const scale = createChartScale({ from: chart.from, to: chart.to, bounds });
  const content = resolveTooltip({ chart, activeKey: active.activeKey, timeZone });
  return (
    <figure className={styles.figure}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="group"
        aria-label="Preço e operações"
      >
        <PriceLayers chart={chart} scale={scale} descriptionId={descriptionId} />
        <PriceChartAxes scale={scale} bounds={bounds} range={chart} timeZone={timeZone} />
        <ChartItems
          chart={chart}
          scale={scale}
          timeZone={timeZone}
          active={active}
          tooltipId={tooltipId}
          onRangeChange={onRangeChange}
        />
      </svg>
      <figcaption id={descriptionId} className={styles.caption}>
        {describeChart({ chart, timeZone })}
      </figcaption>
      <MarkerTooltip id={tooltipId} content={content} />
      <PriceChartLegend hasClusters={chart.clusters !== null} />
    </figure>
  );
}
