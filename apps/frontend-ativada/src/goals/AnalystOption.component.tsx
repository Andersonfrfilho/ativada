// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { Term } from '../glossary/Term.component.js';
import controls from '../styles/Controls.module.css';
import { AnalystModeChoice } from './AnalystModeChoice.component.js';
import styles from './Goals.module.css';
import {
  ANALYST_GOVERN_NOTICE,
  ANALYST_LOCKED_TIMEFRAME_NOTICE,
  ANALYST_MODE,
  ANALYST_OPTION_LABEL,
  ANALYST_ROUND_TRIP_FEE_NOTICE,
  ANALYST_SHADOW_NOTICE,
  type AnalystMode,
} from './simulation-timeframe.constant.js';

export type AnalystOptionProps = {
  readonly isOn: boolean;
  readonly onChange: (isOn: boolean) => void;
  readonly mode: AnalystMode;
  readonly onModeChange: (mode: AnalystMode) => void;
};

// "Deixar o analista de risco decidir": trava a vela em 15 min, explica a taxa de uma ida e volta e deixa escolher entre observar e governar.
export function AnalystOption({
  isOn,
  onChange,
  mode,
  onModeChange,
}: AnalystOptionProps): ReactElement {
  const id = useId();
  return (
    <div className={styles.analystOption}>
      <div className={styles.option}>
        <input
          id={id}
          type="checkbox"
          checked={isOn}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onChange(event.target.checked)}
        />
        <label htmlFor={id} className={styles.optionLabel}>
          {ANALYST_OPTION_LABEL}
        </label>
        <span id={`${id}-hint`} className={`${controls.muted} ${styles.optionHint}`}>
          O <Term term="analyst">analista de risco</Term> só tira risco: pausa as entradas e escolhe
          o tamanho.
        </span>
      </div>
      {isOn ? <AnalystModeChoice mode={mode} onChange={onModeChange} /> : null}
      {isOn ? (
        <div role="status" className={styles.analystNotices}>
          <p className={styles.notice}>{ANALYST_LOCKED_TIMEFRAME_NOTICE}</p>
          <p className={styles.warning}>{ANALYST_ROUND_TRIP_FEE_NOTICE}</p>
          <p className={styles.notice}>
            {mode === ANALYST_MODE.GOVERN ? ANALYST_GOVERN_NOTICE : ANALYST_SHADOW_NOTICE}
          </p>
        </div>
      ) : null}
    </div>
  );
}
