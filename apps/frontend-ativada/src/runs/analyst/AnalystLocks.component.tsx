// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Term } from '../../glossary/Term.component.js';
import { StatusChip, CHIP_TONE } from '../live-tracking/StatusChip.component.js';
import { ANALYST_TEXT } from './analyst.constant.js';
import styles from './Analyst.module.css';
import type { AnalystLock } from './analyst.validation.js';

function LockItem({ lock }: { readonly lock: AnalystLock }): ReactElement {
  const stateWord = lock.isActive
    ? ANALYST_TEXT.LOCK_ACTIVE
    : lock.isApplicable
      ? ANALYST_TEXT.LOCK_FREE
      : ANALYST_TEXT.LOCK_NOT_APPLICABLE;
  return (
    <li className={lock.isActive ? `${styles.lock} ${styles.lockActive}` : styles.lock}>
      <StatusChip
        tone={lock.isActive ? CHIP_TONE.WARN : CHIP_TONE.NEUTRAL}
        icon={lock.isActive ? 'lock' : 'check'}
      >
        {stateWord}
      </StatusChip>
      <span className={styles.lockLine}>{lock.line}</span>
      {lock.message === null ? null : <p className={styles.lockMessage}>{lock.message}</p>}
    </li>
  );
}

// As cinco travas, sempre à vista: as ativas ganham cadeado, a palavra "ativa" e a frase do motivo.
export function AnalystLocks({ locks }: { readonly locks: readonly AnalystLock[] }): ReactElement {
  return (
    <section className={styles.section} aria-label={ANALYST_TEXT.LOCKS_TITLE}>
      <h3 className={styles.sectionTitle}>
        <Term term="lock">{ANALYST_TEXT.LOCKS_TITLE}</Term>
      </h3>
      {locks.length === 0 ? (
        <p className={styles.motive}>{ANALYST_TEXT.NO_LOCKS}</p>
      ) : (
        <ul className={styles.locks}>
          {locks.map((lock) => (
            <LockItem key={lock.key} lock={lock} />
          ))}
        </ul>
      )}
    </section>
  );
}
