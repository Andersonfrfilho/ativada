// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import {
  PANEL_BODY_HALF,
  PANEL_HEIGHT,
  PANEL_TOP,
  PANEL_WIDTH,
  type PanelCandle,
  type PanelCone,
  type PanelForming,
  type PanelModel,
} from './next-candle-model.js';
import styles from './NextCandlePanel.module.css';

// Os textos do desenho já formatados (preço pelo `formatPrice`, hora no fuso do usuário); nenhum número é calculado aqui.
export type NextCandleLabels = {
  readonly description: string;
  readonly low: string | undefined;
  readonly high: string | undefined;
  readonly base: string | undefined;
  readonly arrow: string | undefined;
  readonly start: string;
  readonly end: string;
};

export type NextCandleChartProps = {
  readonly model: PanelModel;
  readonly labels: NextCandleLabels;
};

const AXIS_GAP = 4;
const LABEL_BASELINE = 4;
const NOW_LABEL_GAP = 4;
const NOW_LABEL_DROP = 12;
const TIME_LABEL_DROP = 14;
const NOW_RADIUS = 4.5;

function PastCandle({ candle }: { readonly candle: PanelCandle }): ReactElement {
  const direction = candle.isUp ? styles.up : styles.down;
  return (
    <g className={direction}>
      <line x1={candle.x} x2={candle.x} y1={candle.wickTop} y2={candle.wickBottom} />
      <rect
        x={candle.x - PANEL_BODY_HALF}
        y={candle.bodyTop}
        width={PANEL_BODY_HALF * 2}
        height={candle.bodyHeight}
      />
    </g>
  );
}

function Cone({ cone }: { readonly cone: PanelCone }): ReactElement {
  const isBuy = cone.side === 'buy';
  return (
    <g data-part="cone">
      <polygon
        points={cone.neutral}
        className={`${styles.coneNeutral} ${isBuy ? styles.edgeBuy : styles.edgeSell}`}
      />
      <polygon points={cone.trend} className={isBuy ? styles.coneBuy : styles.coneSell} />
    </g>
  );
}

function FormingCandle({
  forming,
}: {
  readonly forming: PanelForming | undefined;
}): ReactElement | null {
  if (forming === undefined) return null;
  return (
    <rect
      data-part="forming"
      x={forming.x}
      y={forming.top}
      width={forming.width}
      height={forming.height}
      className={`${styles.forming} ${forming.isUp ? styles.edgeBuy : styles.edgeSell}`}
    />
  );
}

type ForecastLayersProps = { readonly model: PanelModel; readonly arrow: string | undefined };

function ForecastLayers({ model, arrow }: ForecastLayersProps): ReactElement {
  const { cone, baseY } = model;
  return (
    <>
      {cone === undefined ? null : <Cone cone={cone} />}
      {baseY === undefined ? null : (
        <line x1={model.split} x2={model.right} y1={baseY} y2={baseY} className={styles.base} />
      )}
      {cone === undefined || arrow === undefined ? null : (
        <text
          x={cone.arrowX}
          y={cone.arrowY + LABEL_BASELINE}
          textAnchor="middle"
          className={cone.side === 'buy' ? styles.arrowBuy : styles.arrowSell}
        >
          {arrow}
        </text>
      )}
    </>
  );
}

function Labels({ model, labels }: NextCandleChartProps): ReactElement {
  const x = model.right + AXIS_GAP;
  const bottom = model.bottom + TIME_LABEL_DROP;
  return (
    <>
      {labels.high === undefined || model.cone === undefined ? null : (
        <text x={x} y={model.cone.highY + LABEL_BASELINE} className={styles.axisText}>
          {labels.high}
        </text>
      )}
      {labels.low === undefined || model.cone === undefined ? null : (
        <text x={x} y={model.cone.lowY + LABEL_BASELINE} className={styles.axisText}>
          {labels.low}
        </text>
      )}
      {labels.base === undefined || model.baseY === undefined ? null : (
        <text x={x} y={model.baseY + LABEL_BASELINE} className={styles.baseText}>
          {labels.base}
        </text>
      )}
      <text x={model.split} y={bottom} textAnchor="end" className={styles.timeText}>
        {labels.start}
      </text>
      <text x={model.right} y={bottom} textAnchor="end" className={styles.timeText}>
        {labels.end}
      </text>
    </>
  );
}

function RealLine({ model }: { readonly model: PanelModel }): ReactElement | null {
  if (model.trail === undefined || model.now === undefined) return null;
  return (
    <g data-part="real-line">
      <polyline points={model.trail} className={styles.trail} />
      <line
        x1={model.now.x}
        x2={model.now.x}
        y1={PANEL_TOP}
        y2={model.bottom}
        className={styles.nowLine}
      />
      <circle cx={model.now.x} cy={model.now.y} r={NOW_RADIUS} className={styles.nowDot} />
      <text
        x={model.now.x - NOW_LABEL_GAP}
        y={PANEL_TOP + NOW_LABEL_DROP}
        textAnchor="end"
        className={styles.nowText}
      >
        agora
      </text>
    </g>
  );
}

// O desenho do painel: velas recentes, a vela em formação ampliada, o meio-cone da tendência, a linha plana no preço de
// partida e a linha do preço real por cima. As cores vêm das classes do módulo (tokens), nunca de estilo em linha.
export function NextCandleChart({ model, labels }: NextCandleChartProps): ReactElement {
  const { forming } = model;
  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${PANEL_WIDTH} ${PANEL_HEIGHT}`}
      role="img"
      aria-label={labels.description}
    >
      <rect
        x={model.split}
        y={PANEL_TOP}
        width={model.right - model.split}
        height={model.bottom - PANEL_TOP}
        className={styles.future}
      />
      {model.past.map((candle) => (
        <PastCandle key={candle.x} candle={candle} />
      ))}
      <line
        x1={model.split}
        x2={model.split}
        y1={PANEL_TOP}
        y2={model.bottom}
        className={styles.divider}
      />
      <FormingCandle forming={forming} />
      <ForecastLayers model={model} arrow={labels.arrow} />
      <RealLine model={model} />
      <Labels model={model} labels={labels} />
    </svg>
  );
}
