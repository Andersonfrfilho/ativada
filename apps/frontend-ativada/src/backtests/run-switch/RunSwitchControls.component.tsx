// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, Ref } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import controls from '../../styles/Controls.module.css';
import styles from './RunSwitcher.module.css';
import type { RunNeighbours } from './useRunNeighbours.hook.js';

export type RunSwitchTriggerProps = {
  readonly triggerRef: Ref<HTMLButtonElement>;
  readonly current: string;
  readonly isOpen: boolean;
  readonly isDisabled: boolean;
  readonly onOpen: () => void;
};

export function RunSwitchTrigger(props: RunSwitchTriggerProps): ReactElement {
  return (
    <button
      ref={props.triggerRef}
      type="button"
      className={styles.trigger}
      disabled={props.isDisabled}
      aria-haspopup="dialog"
      aria-expanded={props.isOpen}
      onClick={props.onOpen}
    >
      <Icon name="swap" size={18} />
      <span className={styles.triggerText}>
        <span className={styles.triggerLabel}>Trocar execução</span>
        <span className={styles.triggerValue}>{props.current}</span>
      </span>
      <Icon name="chevronDown" size={16} />
    </button>
  );
}

export type RunSwitchStepsProps = {
  readonly neighbours: RunNeighbours;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
};

// Anterior e próxima seguem a lista da mesma moeda e tipo; `[` e `]` fazem o mesmo fora de um campo.
export function RunSwitchSteps({
  neighbours,
  onPrevious,
  onNext,
}: RunSwitchStepsProps): ReactElement {
  return (
    <div className={styles.steps}>
      <button
        type="button"
        className={controls.button}
        disabled={neighbours.previousId === undefined}
        aria-keyshortcuts="["
        aria-label="Execução anterior da lista (a mais nova)"
        onClick={onPrevious}
      >
        <Icon name="chevronLeft" size={16} />
        Anterior
      </button>
      <button
        type="button"
        className={controls.button}
        disabled={neighbours.nextId === undefined && !neighbours.canLoadNext}
        aria-keyshortcuts="]"
        aria-label="Próxima execução da lista (a mais antiga)"
        onClick={onNext}
      >
        Próxima
        <Icon name="chevronRight" size={16} />
      </button>
    </div>
  );
}
