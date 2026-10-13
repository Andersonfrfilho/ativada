// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChangeEvent, ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import {
  applyDateField,
  availableShortcuts,
  canShift,
  clampRange,
  isSameRange,
  rangeForShortcut,
  shiftRange,
  toDateFieldValue,
  type ChartRange,
} from './chart-range.js';
import styles from './ChartRangeControls.module.css';

export type ChartRangeControlsProps = {
  // O período inteiro da execução; sem ele só "Tudo" existe.
  readonly extent: ChartRange | undefined;
  // A faixa da URL; `undefined` é "Tudo".
  readonly range: ChartRange | undefined;
  // O que o gráfico mostra agora (a faixa da URL ou o período inteiro), para preencher os campos de data.
  readonly shown: ChartRange | undefined;
  readonly onRangeChange: (range: ChartRange | undefined) => void;
};

type ShortcutButtonsProps = Pick<ChartRangeControlsProps, 'extent' | 'range' | 'onRangeChange'>;

function ShortcutButtons({ extent, range, onRangeChange }: ShortcutButtonsProps): ReactElement {
  return (
    <div className={styles.row}>
      {availableShortcuts(extent).map((shortcut) => {
        const target = extent === undefined ? undefined : rangeForShortcut(extent, shortcut);
        const isPressed = isSameRange(target, range);
        return (
          <button
            key={shortcut.key}
            type="button"
            className={`${controls.button} ${isPressed ? styles.pressed : ''}`}
            aria-pressed={isPressed}
            onClick={() => onRangeChange(target)}
          >
            {shortcut.label}
          </button>
        );
      })}
    </div>
  );
}

type DateFieldsProps = Pick<ChartRangeControlsProps, 'extent' | 'shown' | 'onRangeChange'>;

function DateFields({ extent, shown, onRangeChange }: DateFieldsProps): ReactElement {
  function handleChange(edge: 'from' | 'to', event: ChangeEvent<HTMLInputElement>): void {
    if (shown === undefined) return;
    const next = applyDateField(shown, edge, event.target.value);
    const inside = next === undefined || extent === undefined ? next : clampRange(next, extent);
    if (inside !== undefined) onRangeChange(inside);
  }
  return (
    <div className={styles.row}>
      <label className={styles.field}>
        De (data em UTC)
        <input
          type="date"
          className={controls.input}
          value={shown === undefined ? '' : toDateFieldValue(shown.from)}
          onChange={(event) => handleChange('from', event)}
        />
      </label>
      <label className={styles.field}>
        Até (data em UTC)
        <input
          type="date"
          className={controls.input}
          value={shown === undefined ? '' : toDateFieldValue(shown.to - 1)}
          onChange={(event) => handleChange('to', event)}
        />
      </label>
    </div>
  );
}

function StepButtons({ extent, range, onRangeChange }: ShortcutButtonsProps): ReactElement {
  const step = (direction: 1 | -1): void => {
    if (range !== undefined && extent !== undefined) {
      onRangeChange(shiftRange({ range, extent, direction }));
    }
  };
  const isEnabled = (direction: 1 | -1): boolean =>
    range !== undefined && extent !== undefined && canShift({ range, extent, direction });
  return (
    <div className={styles.row}>
      <button
        type="button"
        className={controls.button}
        disabled={!isEnabled(-1)}
        onClick={() => step(-1)}
      >
        <span aria-hidden="true">◀</span>&nbsp;anterior
      </button>
      <button
        type="button"
        className={controls.button}
        disabled={!isEnabled(1)}
        onClick={() => step(1)}
      >
        próximo&nbsp;<span aria-hidden="true">▶</span>
      </button>
    </div>
  );
}

// Atalhos, datas e passos: tudo escreve na faixa da URL, que é a única fonte da faixa visível.
export function ChartRangeControls(props: ChartRangeControlsProps): ReactElement {
  return (
    <div className={styles.controls} role="group" aria-label="Período do gráfico">
      <ShortcutButtons {...props} />
      <DateFields {...props} />
      <StepButtons {...props} />
    </div>
  );
}
