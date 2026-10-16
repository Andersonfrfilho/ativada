// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement, type ReactNode } from 'react';

import { GLOSSARY, type GlossaryTerm } from './glossary.constant.js';
import styles from './Term.module.css';
import { useTermDisclosure } from './useTermDisclosure.hook.js';

export type TermProps = {
  readonly term: GlossaryTerm;
  // O rótulo que a tela já mostra (pode ser "slippage" no meio de uma frase); sem ele, o do glossário.
  readonly children?: ReactNode;
};

export function Term({ term, children }: TermProps): ReactElement {
  const entry = GLOSSARY[term];
  const phraseId = useId();
  const { isOpen, rootRef, buttonProps } = useTermDisclosure();
  return (
    <span ref={rootRef} className={styles.term}>
      <span>{children ?? entry.label}</span>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`O que é ${entry.label}?`}
        aria-expanded={isOpen}
        aria-describedby={phraseId}
        {...buttonProps}
      >
        <span className={styles.glyph} aria-hidden="true">
          ?
        </span>
      </button>
      <span id={phraseId} role="tooltip" className={styles.phrase} hidden={!isOpen}>
        {entry.example === undefined ? entry.phrase : `${entry.phrase} ${entry.example}`}
      </span>
    </span>
  );
}
