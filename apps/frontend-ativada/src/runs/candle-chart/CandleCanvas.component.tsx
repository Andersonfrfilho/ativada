// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useRef, type ReactElement } from 'react';

import { formatSymbol } from '../../format/format.js';
import { describeChart } from '../chart-description.js';
import styles from './CandleChart.module.css';
import { CHART_LAYER } from './candle-chart.constant.js';
import { CHART_KEYBOARD_HELP } from './chart-key-plan.js';
import { ChartCredit } from './ChartCredit.component.js';
import { ChartToolbar } from './ChartToolbar.component.js';
import { ClusterButtons } from './ClusterButtons.component.js';
import { LayerBar } from './LayerBar.component.js';
import { BesideTeam } from '../team-room/BesideTeam.component.js';
import { LeaderFocusProvider } from '../team-room/balcony/leader-focus.context.js';
import { FormingBand } from '../team-room/balcony/FormingBand.component.js';
import { LeaderOverlay } from '../team-room/balcony/LeaderOverlay.component.js';
import { TeamAside } from '../team-room/TeamAside.context.js';
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
        options={source.timeframeOptions}
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
      <TimeframeNotice
        timeframe={source.timeframe}
        runTimeframe={chart.timeframe}
        displayMapping={source.displayMapping}
        hasRetentionCut={
          source.retentionStart !== undefined && chart.runRange.from < source.retentionStart
        }
      />
      <LiveCandleNotice live={model.live} />
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

type DescriptionIds = { readonly help: string; readonly caption: string };

// O gráfico é UMA parada de Tab (RF20): setas, Shift+seta, mais e menos, Home, End, Esc e Enter agem na cruz; a ajuda de
// teclado e a descrição textual são lidas pelo leitor de tela ao chegar nele.
function SurfaceBox({
  chart,
  model,
  ids,
}: CanvasViewProps & { readonly ids: DescriptionIds }): ReactElement {
  return (
    <div
      ref={model.containerRef}
      className={styles.canvas}
      role="img"
      aria-roledescription="gráfico de velas"
      aria-label={`Gráfico de velas de ${formatSymbol(chart.symbol)}`}
      aria-describedby={`${ids.help} ${ids.caption}`}
      tabIndex={0}
      onKeyDown={model.keyboard.onKeyDown}
    />
  );
}

function ChartCaption(props: CanvasViewProps & { readonly id: string }): ReactElement {
  const { chart, view, model, id } = props;
  const forecast =
    view.isLive && model.isLayerOn(CHART_LAYER.FORECAST) ? model.forecastText : undefined;
  return (
    <figcaption id={id} className={styles.caption}>
      {describeChart({ chart, timeZone: model.timeZone, forecast })}
    </figcaption>
  );
}

// A coluna ao lado do gráfico: com a camada "Previsão", a próxima vela de perto (a equipe fica na varanda, acima do gráfico).
function ChartSide({ chart, model, source }: CanvasViewProps): ReactElement {
  const { displayMapping, history } = source;
  const display =
    displayMapping === undefined
      ? undefined
      : { mapping: displayMapping, candles: history.candles };
  return (
    <div className={styles.side}>
      <NextCandlePanel chart={chart} layerData={model.layerData} display={display} />
    </div>
  );
}

function CanvasFooter(props: CanvasViewProps & { readonly ids: DescriptionIds }): ReactElement {
  const { chart, selection, model, ids } = props;
  return (
    <>
      {chart.clusters === null ? null : (
        <ClusterButtons
          clusters={chart.clusters}
          timeZone={model.timeZone}
          onZoom={selection.setRange}
        />
      )}
      <ChartCaption {...props} id={ids.caption} />
      <p id={ids.help} className={styles.visuallyHidden}>
        {CHART_KEYBOARD_HELP}
      </p>
      <p role="status" aria-live="polite" className={styles.visuallyHidden}>
        {model.keyboard.announcement}
      </p>
      <ChartCredit />
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
        <FormingBand
          runId={props.runId}
          isLive={view.isLive}
          surface={model.surface}
          canvasRef={model.containerRef}
          figureRef={figureRef}
        />
        <LeaderOverlay
          surface={model.surface}
          canvasRef={model.containerRef}
          figureRef={figureRef}
        />
      </figure>
    </LeaderFocusProvider>
  );
}

// O gráfico de velas: a superfície de desenho recebe as velas, o volume, as setas e as camadas; a legenda, os botões e o
// texto para leitor de tela ficam em HTML por cima e por baixo do canvas.
export function CandleCanvas(props: CandleCanvasInput): ReactElement {
  const model = useCandleCanvasModel(props);
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
  return <CanvasView {...props} model={model} />;
}
