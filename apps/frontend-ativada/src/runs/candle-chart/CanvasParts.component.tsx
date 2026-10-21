// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatSymbol } from '../../format/format.js';
import { describeChart } from '../chart-description.js';
import styles from './CandleChart.module.css';
import { CHART_LAYER } from './candle-chart.constant.js';
import { CHART_KEYBOARD_HELP } from './chart-key-plan.js';
import { ChartCredit } from './ChartCredit.component.js';
import { ChartTooltip } from './ChartTooltip.component.js';
import { ClusterButtons } from './ClusterButtons.component.js';
import { NextCandlePanel } from './NextCandlePanel.component.js';
import type { CandleCanvasInput, CandleCanvasModel } from './useCandleCanvasModel.hook.js';
import { useChartTooltip } from './useChartTooltip.hook.js';
import { useTooltipHotkey } from './useTooltipHotkey.hook.js';

// As peças do gráfico de velas que a vista normal e o telão-terminal da sala dividem.
export type CanvasViewProps = CandleCanvasInput & { readonly model: CandleCanvasModel };

export type DescriptionIds = { readonly help: string; readonly caption: string };

// O gráfico é UMA parada de Tab (RF20): setas, Shift+seta, mais e menos, Home, End, Esc e Enter agem na cruz; a ajuda de
// teclado e a descrição textual são lidas pelo leitor de tela ao chegar nele.
export function SurfaceBox({
  runId,
  view,
  chart,
  source,
  model,
  ids,
}: CanvasViewProps & { readonly ids: DescriptionIds }): ReactElement {
  const isOn = source.preferences.preferences.isTooltipOn;
  const tooltip = useChartTooltip({ runId, isLive: view.isLive, chart, source, model, isOn });
  useTooltipHotkey(source.preferences.toggleTooltip);
  return (
    <div className={styles.canvasFrame}>
      <div
        ref={model.containerRef}
        className={styles.canvas}
        role="img"
        aria-roledescription="gráfico de velas"
        aria-label={`Gráfico de velas de ${formatSymbol(chart.symbol)}`}
        aria-describedby={`${ids.help} ${ids.caption}`}
        tabIndex={0}
        onKeyDown={model.keyboard.onKeyDown}
        {...tooltip.handlers}
      />
      <ChartTooltip id={tooltip.id} model={tooltip.model} tipRef={tooltip.tipRef} />
    </div>
  );
}

export function ChartCaption(props: CanvasViewProps & { readonly id: string }): ReactElement {
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
export function ChartSide({ runId, chart, model, source }: CanvasViewProps): ReactElement {
  const { displayMapping, history } = source;
  const display =
    displayMapping === undefined
      ? undefined
      : { mapping: displayMapping, candles: history.candles };
  return (
    <div className={styles.side}>
      <NextCandlePanel runId={runId} chart={chart} layerData={model.layerData} display={display} />
    </div>
  );
}

export function CanvasFooter(
  props: CanvasViewProps & { readonly ids: DescriptionIds; readonly hasCredit?: boolean },
): ReactElement {
  const { chart, selection, model, ids, hasCredit = true } = props;
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
      {hasCredit ? <ChartCredit /> : null}
    </>
  );
}
