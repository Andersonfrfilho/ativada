// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Notices.module.css';

type SwitchProps = {
  readonly id: string;
  readonly label: string;
  readonly help: string;
  readonly isOn: boolean;
  readonly onChange: (isOn: boolean) => void;
};

// Um interruptor de verdade (`role="switch"`), com uma linha de ajuda; o alvo de toque tem 44 px.
export function NoticeSwitch({ id, label, help, isOn, onChange }: SwitchProps): ReactElement {
  return (
    <div className={styles['pref']}>
      <span id={`${id}-label`} className={styles['prefLabel']}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        id={id}
        className={styles['switch']}
        aria-checked={isOn}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        onClick={() => onChange(!isOn)}
      />
      <span id={`${id}-help`} className={styles['help']}>
        {help}
      </span>
    </div>
  );
}
