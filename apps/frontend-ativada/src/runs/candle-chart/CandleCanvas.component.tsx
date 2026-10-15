// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { formatSymbol } from '../../format/format.js';
import { describeChart } from '../chart-description.js';
import styles from './CandleChart.module.css';
import { CHART_LAYER } from './candle-chart.constant.js';
import { ChartCredit } from './ChartCredit.component.js';
import { ChartToolbar } from './ChartToolbar.component.js';
import { ClusterButtons } from './ClusterButtons.component.js';
import { LayerBar } from './LayerBar.component.js';
import { LayerNotices } from './LayerNotices.component.js';
import { LiveCandleNotice } from './LiveCandleNotice.component.js';
import { NextCandlePanel } from './NextCandlePanel.component.js';
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

function CanvasHeader({ chart, view, source, model }: CanvasViewProps): ReactElement {
  return (
    <>
      <ChartToolbar
        timeframe={source.timeframe}
        runTimeframe={chart.timeframe}
        surface={model.surface}
        onTimeframeChange={model.handleTimeframeChange}
      />
      <LayerBar
        layers={source.preferences.preferences.layers}
        isLive={view.isLive}
        isStrategyTimeframe={model.layerData.isStrategyTimeframe}
        onToggle={source.preferences.toggleLayer}
      />
      <TimeframeNotice timeframe={source.timeframe} runTimeframe={chart.timeframe} />
      <LiveCandleNotice live={model.live} />
      {model.legend === undefined ? null : <OhlcLegend text={model.legend} />}
    </>
  );
}

function CanvasView(props: CanvasViewProps): ReactElement {
  const { chart, view, selection, model } = props;
  const captionId = useId();
  return (
    <figure className={styles.wrapper}>
      <CanvasHeader {...props} />
      <div className={styles.chartLayout}>
        <div
          ref={model.containerRef}
          className={styles.canvas}
          role="img"
          aria-label={`Gráfico de velas de ${formatSymbol(chart.symbol)}`}
          aria-describedby={captionId}
        />
        {view.isLive && model.isLayerOn(CHART_LAYER.FORECAST) ? (
          <NextCandlePanel chart={chart} layerData={model.layerData} />
        ) : null}
      </div>
      <LayerNotices
        data={model.layerData}
        decisions={chart.decisions}
        isOn={model.isLayerOn}
        isLive={view.isLive}
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

// O gráfico de velas: a superfície de desenho recebe as velas, o volume, as setas e as camadas; a legenda, os botões e o
// texto para leitor de tela ficam em HTML por cima e por baixo do canvas.
export function CandleCanvas(props: CandleCanvasInput): ReactElement {
  const model = useCandleCanvasModel(props);
  if (model.hasFailed) {
    const { chart, selection } = props;
    return (
      <SimpleChartFallback
        chart={chart}
        timeZone={model.timeZone}
        selection={selection}
        reason={SURFACE_FAILED_REASON}
      />
    );
  }
  return <CanvasView {...props} model={model} />;
}
