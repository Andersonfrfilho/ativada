// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import styles from './Goals.module.css';
import {
  ANALYST_MODE,
  ANALYST_MODE_HINT,
  ANALYST_MODE_LABEL,
  ANALYST_MODE_LEGEND,
  type AnalystMode,
} from './simulation-timeframe.constant.js';

export type AnalystModeChoiceProps = {
  readonly mode: AnalystMode;
  readonly onChange: (mode: AnalystMode) => void;
};

const MODES: readonly AnalystMode[] = [ANALYST_MODE.SHADOW, ANALYST_MODE.GOVERN];

// Observar (sombra) é o padrão: governar é uma escolha de quem entendeu que a simulação passa a obedecer ao analista.
export function AnalystModeChoice({ mode, onChange }: AnalystModeChoiceProps): ReactElement {
  const name = useId();
  return (
    <fieldset className={styles.analystModes}>
      <legend className={controls.muted}>{ANALYST_MODE_LEGEND}</legend>
      {MODES.map((option) => (
        <div key={option} className={styles.option}>
          <input
            id={`${name}-${option}`}
            type="radio"
            name={name}
            checked={mode === option}
            onChange={() => onChange(option)}
          />
          <label htmlFor={`${name}-${option}`} className={styles.optionLabel}>
            {ANALYST_MODE_LABEL[option]}
          </label>
          <span className={`${controls.muted} ${styles.optionHint}`}>
            {ANALYST_MODE_HINT[option]}
          </span>
        </div>
      ))}
    </fieldset>
  );
}
