// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useRef, type ReactElement } from 'react';

import styles from './CandleChart.module.css';
import { CHART_LAYER } from './candle-chart.constant.js';
import { BesideTeam } from '../team-room/BesideTeam.component.js';
import { LeaderFocusProvider } from '../team-room/balcony/leader-focus.context.js';
import { CanvasControls, CanvasNotices } from './CanvasControls.component.js';
import { CanvasOverlays } from './CanvasOverlays.component.js';
import {
  CanvasFooter,
  ChartSide,
  SurfaceBox,
  type CanvasViewProps,
  type DescriptionIds,
} from './CanvasParts.component.js';
import { TeamAside } from '../team-room/TeamAside.context.js';
import { LayerNotices } from './LayerNotices.component.js';
import { OhlcLegend } from './OhlcLegend.component.js';
import { SimpleChartFallback } from './SimpleChartFallback.component.js';
import { TerminalCanvasView } from './TerminalCanvasView.component.js';
import { useIsTerminalChart } from './terminal-chart.context.js';
import { useCandleCanvasModel, type CandleCanvasInput } from './useCandleCanvasModel.hook.js';

const SURFACE_FAILED_REASON =
  'Não foi possível carregar o desenho do gráfico; mostrando o gráfico simples.';

function CanvasHeader(props: CanvasViewProps): ReactElement {
  const { model } = props;
  return (
    <>
      <CanvasControls {...props} />
      <CanvasNotices {...props} />
      {model.legend === undefined ? null : (
        <OhlcLegend
          text={model.legend}
          tradeText={model.tradeText}
          opinionText={model.opinionText}
        />
      )}
      {model.fifteenLegend === undefined ? null : <OhlcLegend text={model.fifteenLegend} />}
    </>
  );
}

function CanvasView(props: CanvasViewProps): ReactElement {
  const { chart, view, model } = props;
  const hasSide = view.isLive && model.isLayerOn(CHART_LAYER.FORECAST);
  const ids: DescriptionIds = { help: useId(), caption: useId() };
  const figureRef = useRef<HTMLElement>(null);
  return (
    <LeaderFocusProvider>
      <figure ref={figureRef} className={styles.wrapper}>
        <TeamAside pointedOpenTime={model.asideOpenTime} />
        <CanvasHeader {...props} />
        <div className={hasSide ? styles.chartLayout : styles.chartAlone}>
          <SurfaceBox {...props} ids={ids} />
          {hasSide ? <ChartSide {...props} /> : null}
        </div>
        <LayerNotices
          data={model.layerData}
          decisions={chart.decisions}
          isOn={model.isLayerOn}
          isLive={view.isLive}
          hasLevels={model.levels.length > 0}
          zones={model.zones}
          displayMapping={props.source.displayMapping}
        />
        <CanvasFooter {...props} ids={ids} />
        <CanvasOverlays {...props} figureRef={figureRef} />
      </figure>
    </LeaderFocusProvider>
  );
}

// O gráfico de velas: a superfície de desenho recebe as velas, o volume, as setas e as camadas; a legenda, os botões e o
// texto para leitor de tela ficam em HTML por cima e por baixo do canvas.
export function CandleCanvas(props: CandleCanvasInput): ReactElement {
  const model = useCandleCanvasModel(props);
  const isTerminal = useIsTerminalChart();
  if (model.hasFailed) {
    const { chart, selection } = props;
    return (
      <BesideTeam>
        <SimpleChartFallback
          chart={chart}
          timeZone={model.timeZone}
          selection={selection}
          reason={SURFACE_FAILED_REASON}
          onRetry={undefined}
          onBackToRun={undefined}
        />
      </BesideTeam>
    );
  }
  if (isTerminal) return <TerminalCanvasView {...props} model={model} />;
  return <CanvasView {...props} model={model} />;
}
