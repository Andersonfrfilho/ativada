// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../styles/Controls.module.css';
import type { ChartSurface } from './chart-surface.types.js';
import styles from './CandleChart.module.css';
import { DISPLAY_TIMEFRAMES } from './candle-chart.constant.js';
import type { TimeframeChoice } from './useCandleSource.hook.js';

export type ChartToolbarProps = {
  readonly timeframe: string;
  // As velas que o ambiente tem; a da execução vem sempre.
  readonly options: readonly TimeframeChoice[];
  // A vela em que a estratégia decide: vem marcada ao abrir.
  readonly runTimeframe: string;
  readonly onTimeframeChange: (timeframe: TimeframeChoice) => void;
  readonly surface: ChartSurface | undefined;
};

type ZoomButton = {
  readonly label: string;
  readonly symbol: string;
  readonly act: (surface: ChartSurface) => void;
};

const ZOOM_BUTTONS: readonly ZoomButton[] = [
  { label: 'Afastar', symbol: '−', act: (surface) => surface.zoom(-1) },
  { label: 'Aproximar', symbol: '+', act: (surface) => surface.zoom(1) },
  { label: 'Ajustar', symbol: '↔', act: (surface) => surface.fit() },
  { label: 'Agora', symbol: '⇥', act: (surface) => surface.scrollToEnd() },
];

// A vela do gráfico (15m, 1h, 4h, 1d) e os botões de aproximar, afastar, ajustar e ir ao fim: o que a roda e a pinça
// fazem, sem gesto (RF02 e RF05). Alvos de 44 px.
export function ChartToolbar(props: ChartToolbarProps): ReactElement {
  const { timeframe, options, runTimeframe, onTimeframeChange, surface } = props;
  return (
    <div className={styles.toolbar}>
      <div className={styles.row} role="group" aria-label="Vela do gráfico">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`${controls.button} ${option === timeframe ? styles.pressed : ''}`}
            aria-pressed={option === timeframe}
            onClick={() => onTimeframeChange(option)}
          >
            {option}
            {option === runTimeframe ? <span className={styles.hint}>da execução</span> : null}
            {DISPLAY_TIMEFRAMES.some((display) => display === option) ? (
              <span className={styles.hint}>só exibição</span>
            ) : null}
          </button>
        ))}
      </div>
      <div className={styles.row} role="group" aria-label="Zoom do gráfico">
        {ZOOM_BUTTONS.map((button) => (
          <button
            key={button.label}
            type="button"
            className={controls.button}
            disabled={surface === undefined}
            onClick={() => surface !== undefined && button.act(surface)}
          >
            <span aria-hidden="true">{button.symbol}</span>
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}
