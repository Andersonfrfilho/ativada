// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatDayInZone, formatTimeInZone } from '../../format/zoned-time.js';
import controls from '../../styles/Controls.module.css';
import type { Duel } from './duel.validation.js';
import {
  buildDuelChart,
  DUEL_CHART_PADDING,
  DUEL_CHART_SIZE,
  type DuelChartModel,
} from './duel-chart.js';
import { DUEL_TEXT } from './duel-text.js';
import styles from './Duel.module.css';

function Legend({ model }: { readonly model: DuelChartModel }): ReactElement {
  return (
    <ul className={styles.legend} aria-label="Legenda do gráfico">
      {model.series.map((series) => (
        <li key={series.runId}>
          <svg
            className={styles.swatch}
            viewBox="0 0 28 8"
            aria-hidden="true"
            data-team={series.team ?? 'rules'}
          >
            <path d="M 0 4 L 28 4" />
          </svg>
          {series.label}
        </li>
      ))}
    </ul>
  );
}

function Lines({ model }: { readonly model: DuelChartModel }): ReactElement {
  return (
    <>
      {model.series.map((series) =>
        series.paths.map((path) => (
          <path
            key={`${series.runId}:${path}`}
            className={styles.line}
            d={path}
            data-team={series.team ?? 'rules'}
          />
        )),
      )}
    </>
  );
}

function describeChart(model: DuelChartModel, timeZone: string): string {
  if (!model.hasPoints || model.firstTime === undefined || model.lastTime === undefined) {
    return DUEL_TEXT.NO_POINTS;
  }
  const from = `${formatDayInZone(model.firstTime, timeZone)} ${formatTimeInZone(model.firstTime, timeZone)}`;
  const to = `${formatDayInZone(model.lastTime, timeZone)} ${formatTimeInZone(model.lastTime, timeZone)}`;
  const last = model.series.map((item) => `${item.label}: ${item.last ?? 'sem ponto'}`).join('; ');
  return `${DUEL_TEXT.CHART_TITLE}, de ${from} a ${to}. Último patrimônio: ${last}.`;
}

// O gráfico único de patrimônio do duelo: uma linha por execução, legenda com ◆/● e nome e traço próprio (nunca só cor).
export function DuelChart({ duel }: { readonly duel: Duel }): ReactElement {
  const timeZone = useUserTimeZone();
  const titleId = useId();
  const model = buildDuelChart(duel);
  if (!model.hasPoints) return <p className={controls.muted}>{DUEL_TEXT.NO_POINTS}</p>;
  const { width, height } = DUEL_CHART_SIZE;
  return (
    <div className={styles.chartBox}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{describeChart(model, timeZone)}</title>
        <line
          className={styles.axis}
          x1={DUEL_CHART_PADDING.left}
          x2={width - DUEL_CHART_PADDING.right}
          y1={height - DUEL_CHART_PADDING.bottom}
          y2={height - DUEL_CHART_PADDING.bottom}
        />
        {model.yLabels.map((label) => (
          <text key={label.text} className={styles.axisText} x={4} y={label.y + 4}>
            {label.text}
          </text>
        ))}
        <Lines model={model} />
      </svg>
      <Legend model={model} />
    </div>
  );
}
