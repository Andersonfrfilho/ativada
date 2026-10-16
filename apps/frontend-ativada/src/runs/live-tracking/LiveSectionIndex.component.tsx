// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import type { RunDetail } from '../run.validation.js';
import { formatDayAndTime } from './goal-text.js';
import { HITS_ANCHOR, OFFICE_ANCHOR } from './live-anchors.js';
import styles from './LiveSectionIndex.module.css';
import { TRACKING_ANCHOR } from './LiveTrackingCard.component.js';
import { DECISIONS_ANCHOR, TRIGGERS_ANCHOR } from './LiveTradesState.component.js';

const SECTION_LINKS = [
  { id: TRACKING_ANCHOR, label: 'Acompanhamento' },
  { id: DECISIONS_ANCHOR, label: 'Decisões' },
  { id: TRIGGERS_ANCHOR, label: 'O que falta' },
  { id: HITS_ANCHOR, label: 'Acertos' },
  { id: OFFICE_ANCHOR, label: 'Escritório' },
] as const;

function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Logo abaixo do gráfico: as seções de baixo à mão, e o instante em que a simulação começa (o gráfico mostra contexto de antes).
export function LiveSectionIndex({ run }: { readonly run: RunDetail }): ReactElement {
  const timeZone = useUserTimeZone();
  return (
    <nav className={styles.index} aria-label="Seções desta simulação">
      <ul className={styles.links}>
        {SECTION_LINKS.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              className={styles.link}
              onClick={() => scrollToSection(section.id)}
            >
              {section.label}
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.start}>
        A simulação começa em {formatDayAndTime(run.periodStart, timeZone)}; o gráfico mostra também
        velas de antes, só como contexto.
      </p>
      <p className={styles.moreBelow}>Mais abaixo ▾</p>
    </nav>
  );
}
