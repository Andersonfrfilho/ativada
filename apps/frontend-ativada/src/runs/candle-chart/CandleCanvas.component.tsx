// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { formatSymbol } from '../../format/format.js';
import { describeChart } from '../chart-description.js';
import styles from './CandleChart.module.css';
import { ChartCredit } from './ChartCredit.component.js';
import { ChartToolbar } from './ChartToolbar.component.js';
import { ClusterButtons } from './ClusterButtons.component.js';
import { OhlcLegend } from './OhlcLegend.component.js';
import { SimpleChartFallback } from './SimpleChartFallback.component.js';
import { TimeframeNotice } from './TimeframeNotice.component.js';
import {
  useCandleCanvasModel,
  type CandleCanvasInput,
  type CandleCanvasModel,
} from './useCandleCanvasModel.hook.js';

const SURFACE_FAILED_REASON =
  'Não foi possível carregar o desenho do gráfico; mostrando o gráfico simples.';

type CanvasViewProps = CandleCanvasInput & { readonly model: CandleCanvasModel };

function CanvasView({ chart, selection, source, model }: CanvasViewProps): ReactElement {
  const captionId = useId();
  const symbol = formatSymbol(chart.symbol);
  return (
    <figure className={styles.wrapper}>
      <ChartToolbar
        timeframe={source.timeframe}
        runTimeframe={chart.timeframe}
        surface={model.surface}
        onTimeframeChange={model.handleTimeframeChange}
      />
      <TimeframeNotice timeframe={source.timeframe} runTimeframe={chart.timeframe} />
      {model.legend === undefined ? null : <OhlcLegend text={model.legend} />}
      <div
        ref={model.containerRef}
        className={styles.canvas}
        role="img"
        aria-label={`Gráfico de velas de ${symbol}`}
        aria-describedby={captionId}
      />
      {chart.clusters === null ? null : (
        <ClusterButtons
          clusters={chart.clusters}
          timeZone={model.timeZone}
          onZoom={selection.setRange}
        />
      )}
      <figcaption id={captionId} className={styles.caption}>
        {describeChart({ chart, timeZone: model.timeZone })}
      </figcaption>
      <ChartCredit />
    </figure>
  );
}

// O gráfico de velas: a superfície de desenho recebe as velas, o volume e as setas; a legenda, os botões e o texto para
// leitor de tela ficam em HTML por cima e por baixo do canvas.
export function CandleCanvas(props: CandleCanvasInput): ReactElement {
  const model = useCandleCanvasModel(props);
  if (model.hasFailed) {
    const { chart, selection } = props;
    const { timeZone } = model;
    return (
      <SimpleChartFallback
        chart={chart}
        timeZone={timeZone}
        selection={selection}
        reason={SURFACE_FAILED_REASON}
      />
    );
  }
  return <CanvasView {...props} model={model} />;
}
