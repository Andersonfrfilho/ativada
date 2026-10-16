// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './TeamRoomCard.module.css';
import {
  describeAnalyst,
  describeAnnouncement,
  describeAuditor,
  describeSpecialist,
} from './team-room-lines.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import type { AuditorView, TeamRoomView } from './team-room.types.js';

export type TeamRoomLinesProps = {
  readonly view: TeamRoomView;
  readonly auditor: AuditorView | undefined;
  readonly closedText: string;
  // Só depois do fim da sequência de uma vela NOVA o aviso do leitor de tela ganha texto (uma vez por vela).
  readonly isAnnounced: boolean;
};

// As falas desta vela em texto (equivalente do palco, que é decorativo) e o aviso `aria-live` moderado.
export function TeamRoomLines({
  view,
  auditor,
  closedText,
  isAnnounced,
}: TeamRoomLinesProps): ReactElement {
  return (
    <>
      <details className={styles.lines} open>
        <summary className={styles.linesSummary}>{TEAM_ROOM_TEXT.LINES_SUMMARY}</summary>
        <ol className={styles.linesList}>
          {view.specialists.map((specialist) => (
            <li key={specialist.family}>{describeSpecialist(specialist)}</li>
          ))}
          <li>{describeAnalyst(view)}</li>
          {auditor === undefined ? null : <li>{describeAuditor(auditor)}</li>}
        </ol>
      </details>
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {isAnnounced ? describeAnnouncement(view, closedText) : ''}
      </p>
    </>
  );
}
