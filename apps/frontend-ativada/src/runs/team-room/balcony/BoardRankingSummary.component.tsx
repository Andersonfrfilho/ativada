// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { StatusChip } from '../../live-tracking/StatusChip.component.js';
import type { AuditorView } from '../team-room.types.js';
import styles from './Balcony.module.css';
import { BALCONY_TEXT } from './balcony.constant.js';

// O resumo do auditor sobre as previsões da simulação (o servidor ainda não mede por especialista).
export function BoardRankingSummary({
  auditor,
}: {
  readonly auditor: AuditorView | undefined;
}): ReactElement {
  if (auditor === undefined) return <p className={styles.boardNote}>{BALCONY_TEXT.MEASURING}</p>;
  return (
    <ul className={styles.boardList}>
      <li>
        <StatusChip tone={auditor.look.tone} icon={auditor.look.icon}>
          {auditor.look.word}
        </StatusChip>{' '}
        {auditor.rateText} · moeda ao ar {auditor.coinText}
      </li>
      {auditor.intervalText === undefined ? null : <li>{auditor.intervalText}</li>}
      <li>{BALCONY_TEXT.NO_MEASURE_NOTE}</li>
    </ul>
  );
}
