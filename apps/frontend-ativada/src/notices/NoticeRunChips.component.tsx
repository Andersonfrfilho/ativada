// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Notices.module.css';
import type { RunOption } from './notice-groups.js';

type ChipsProps = {
  readonly options: readonly RunOption[];
  readonly selected: string | undefined;
  readonly onSelect: (runId: string | undefined) => void;
};

// O filtro "Todas / por simulação": chips de 44 px, só das simulações que têm aviso.
export function NoticeRunChips({ options, selected, onSelect }: ChipsProps): ReactElement | null {
  if (options.length === 0) return null;
  return (
    <div className={styles['chips']} role="group" aria-label="Filtrar por simulação">
      <button
        type="button"
        className={styles['chip']}
        aria-pressed={selected === undefined}
        onClick={() => onSelect(undefined)}
      >
        Todas
      </button>
      {options.map((option) => (
        <button
          key={option.runId}
          type="button"
          className={styles['chip']}
          aria-pressed={selected === option.runId}
          onClick={() => onSelect(option.runId)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
