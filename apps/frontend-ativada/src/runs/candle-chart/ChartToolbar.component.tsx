// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import controls from '../../styles/Controls.module.css';
import type { ChartSurface } from './chart-surface.types.js';
import styles from './CandleChart.module.css';
import { DISPLAY_TIMEFRAMES, describeRetention } from './candle-chart.constant.js';
import type { TimeframeChoice } from './useCandleSource.hook.js';

export type ChartToolbarProps = {
  readonly timeframe: string;
  // As velas que o ambiente tem; a da execução vem sempre.
  readonly options: readonly TimeframeChoice[];
  // A vela em que a estratégia decide: vem marcada ao abrir.
  readonly runTimeframe: string;
  readonly onTimeframeChange: (timeframe: TimeframeChoice) => void;
  // A execução inteira é anterior ao corte da retenção: as velas de exibição não existem para ela.
  // Velas de exibição cuja retenção já não cobre a execução inteira.
  readonly unavailableOptions?: readonly string[] | undefined;
  // Leva o gráfico ao começo da simulação (só com vela de exibição, onde o começo fica longe da ponta).
  readonly onGoToStart?: (() => void) | undefined;
  // O balão de valores é opcional: ligado, segue o mouse; desligado, só abre ao clicar ou tocar numa vela.
  readonly isTooltipOn?: boolean | undefined;
  readonly onToggleTooltip?: (() => void) | undefined;
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

type ZoomGroupProps = {
  readonly surface: ChartSurface | undefined;
  readonly onGoToStart: (() => void) | undefined;
};

function ZoomGroup({ surface, onGoToStart }: ZoomGroupProps): ReactElement {
  return (
    <div className={styles.row} role="group" aria-label="Zoom do gráfico">
      {onGoToStart === undefined ? null : (
        <button
          type="button"
          className={controls.button}
          aria-label="Ir ao início da simulação"
          onClick={onGoToStart}
        >
          <span aria-hidden="true">⇤</span>
          <span className={styles.toolLabel}>Início</span>
        </button>
      )}
      {ZOOM_BUTTONS.map((button) => (
        <button
          key={button.label}
          type="button"
          className={controls.button}
          disabled={surface === undefined}
          title={button.label}
          onClick={() => surface !== undefined && button.act(surface)}
        >
          <span aria-hidden="true">{button.symbol}</span>
          <span className={styles.toolLabel}>{button.label}</span>
        </button>
      ))}
    </div>
  );
}

const RETENTION_HINT_ID = 'timeframe-retention-hint';

function isDisplayOption(option: string): boolean {
  return DISPLAY_TIMEFRAMES.some((display) => display === option);
}

function TimeframeGroup(props: ChartToolbarProps): ReactElement {
  const { timeframe, options, runTimeframe, onTimeframeChange } = props;
  const unavailable = props.unavailableOptions ?? [];
  return (
    <>
      <div className={styles.row} role="group" aria-label="Vela do gráfico">
        {options.map((option) => {
          const isBlocked = unavailable.includes(option) && option !== timeframe;
          return (
            <button
              key={option}
              type="button"
              className={`${controls.button} ${option === timeframe ? styles.pressed : ''}`}
              aria-pressed={option === timeframe}
              disabled={isBlocked}
              aria-describedby={isBlocked ? RETENTION_HINT_ID : undefined}
              title={isBlocked ? describeRetention(option) : undefined}
              onClick={() => onTimeframeChange(option)}
            >
              {option}
              {option === runTimeframe ? <span className={styles.hint}>da execução</span> : null}
              {isDisplayOption(option) ? <span className={styles.hint}>só exibição</span> : null}
            </button>
          );
        })}
      </div>
      {unavailable.length > 0 && !isDisplayOption(timeframe) ? (
        <p id={RETENTION_HINT_ID} className={controls.muted}>
          <Icon name="info" size={14} /> {unavailable.map(describeRetention).join(' ')}
        </p>
      ) : null}
    </>
  );
}

// A vela do gráfico (15m, 1h, 4h, 1d) e os botões de aproximar, afastar, ajustar e ir ao fim: o que a roda e a pinça
// fazem, sem gesto (RF02 e RF05). Alvos de 44 px.
export function ChartToolbar(props: ChartToolbarProps): ReactElement {
  const { surface, onGoToStart, isTooltipOn, onToggleTooltip } = props;
  return (
    <div className={styles.toolbar}>
      <TimeframeGroup {...props} />
      <ZoomGroup surface={surface} onGoToStart={onGoToStart} />
      {onToggleTooltip === undefined ? null : (
        <button
          type="button"
          className={`${controls.button} ${isTooltipOn === true ? styles.pressed : ''}`}
          aria-pressed={isTooltipOn === true}
          title="Balão de valores"
          onClick={onToggleTooltip}
        >
          <Icon name="info" size={16} />
          <span className={styles.toolLabel}>
            Balão de valores: {isTooltipOn === true ? 'ligado' : 'desligado'}
          </span>
        </button>
      )}
    </div>
  );
}
